const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const pool = require('./config/db');
const productSpecs = require('./data/product-specs.json');

const app = express();

const phpPrice = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});
const monthYear = new Intl.DateTimeFormat('en-PH', {
  month: 'long',
  year: 'numeric',
});
const shortDate = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
});
const orderDate = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const orderDateTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const FREE_SHIPPING_THRESHOLD = 2000;
const SHIPPING_FEE = 150;
const orderStatusCopy = {
  placed: 'Order placed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const safeNext = (value, fallback = '/') => {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  return path;
};

const shippingFor = (subtotal, hasItems = true) => {
  if (!hasItems) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
};

const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    const nextPath =
      req.method === 'GET' ? req.originalUrl : safeNext(req.body && req.body.next, '/');
    return res.redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  next();
};

const discountPercent = (product) =>
  Number(product.real_price) > Number(product.discounted_price)
    ? Math.round((1 - Number(product.discounted_price) / Number(product.real_price)) * 100)
    : 0;

const savings = (product) =>
  Math.max(Number(product.real_price) - Number(product.discounted_price), 0);

const productIcon = (product) => {
  const types = Array.isArray(product.type) ? product.type : [];
  if (types.includes('camera')) return 'camera';
  if (types.includes('lenses')) return 'aperture';
  return 'package';
};

const SEARCH_TYPES = [
  { value: 'camera', label: 'Cameras' },
  { value: 'lenses', label: 'Lenses' },
  { value: 'accessories', label: 'Accessories' },
];
const SEARCH_QUICK_LINKS = [
  { label: 'Sony', href: '/search?q=Sony' },
  { label: 'Canon', href: '/search?q=Canon' },
  { label: 'Nikon', href: '/search?q=Nikon' },
  { label: 'Full frame', href: '/search?q=full%20frame' },
  { label: 'Lenses', href: '/search?q=lenses' },
];

const normalizeSearchQuery = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
};

const searchHref = (query, type = '') => {
  const parts = [];
  if (query) parts.push(`q=${encodeURIComponent(query)}`);
  if (type) parts.push(`type=${encodeURIComponent(type)}`);
  return parts.length ? `/search?${parts.join('&')}` : '/search';
};

const searchTypeMatches = (product, type) => {
  if (type === 'camera') return product.type.includes('camera');
  if (type === 'lenses') return product.type.includes('lenses');
  if (type === 'accessories') {
    return product.type.includes('accessories') && !product.type.includes('camera');
  }
  return true;
};

const specSearchText = (spec) => {
  if (!spec) return '';

  const parts = [];
  (spec.overview || []).forEach((value) => parts.push(value));
  (spec.highlights || []).forEach((item) => parts.push(item.value, item.label));
  (spec.specs || []).forEach((group) => {
    parts.push(group.title);
    (group.items || []).forEach((item) => parts.push(item.label, item.value));
  });
  (spec.box || []).forEach((value) => parts.push(value));

  return parts.filter(Boolean).join(' ').toLowerCase();
};

const searchProducts = (query, type = '') => {
  const phrase = query.toLowerCase();
  const tokens = phrase.split(' ').filter(Boolean);

  return productsCache
    .filter((product) => searchTypeMatches(product, type))
    .map((product) => {
      const name = product.name.toLowerCase();
      const brand = product.brand.toLowerCase();
      const description = String(product.description || '').toLowerCase();
      const types = product.type.join(' ').toLowerCase();
      const specs = specSearchText(productSpecs[product.slug]);
      const haystack = `${name} ${brand} ${description} ${types} ${specs}`;

      if (!tokens.every((token) => haystack.includes(token))) return null;

      let score = 0;
      if (name === phrase) score += 140;
      else if (name.startsWith(phrase)) score += 95;
      else if (name.includes(phrase)) score += 60;

      if (brand === phrase) score += 80;
      else if (brand.includes(phrase)) score += 45;

      if (types.includes(phrase)) score += 20;

      tokens.forEach((token) => {
        if (name.includes(token)) score += 20;
        if (brand.includes(token)) score += 15;
        if (types.includes(token)) score += 8;
        if (description.includes(token)) score += 4;
        if (specs.includes(token)) score += 2;
      });

      score += Math.min(Number(product.amount_sold || 0) / 250, 12);
      return { product, score };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.product.amount_sold) - Number(a.product.amount_sold) ||
        a.product.name.localeCompare(b.product.name),
    )
    .map((entry) => entry.product);
};

const fallbackSpecContent = (product) => {
  const types = Array.isArray(product.type) ? product.type : [];
  const typeLabel = types.includes('camera')
    ? 'Camera'
    : types.includes('lenses')
      ? 'Lens'
      : 'Accessory';

  return {
    highlights: [
      { icon: productIcon(product), value: product.brand, label: 'Brand' },
      { icon: 'star', value: `${Number(product.ratings || 0).toFixed(1)} / 5`, label: 'Customer rating' },
      { icon: 'package', value: `${Number(product.amount_sold || 0).toLocaleString('en-PH')} sold`, label: 'Units sold' },
      { icon: 'shield-check', value: '1 year', label: 'Warranty' },
    ],
    overview: [product.description || ''],
    specs: [
      {
        title: 'Catalog details',
        items: [
          { label: 'Type', value: typeLabel },
          { label: 'Brand', value: product.brand },
          { label: 'Price', value: phpPrice.format(Number(product.discounted_price)) },
          { label: 'Added', value: shortDate.format(new Date(product.date_added)) },
        ],
      },
    ],
    box: [product.name, 'Documentation', 'Warranty card'],
  };
};

const parseFocal = (name) => {
  const match = /(\d+)(?:\s*-\s*(\d+))?\s*mm/i.exec(name);
  if (!match) {
    return { focalMin: null, focalMax: null, focalLabel: '', kind: '' };
  }

  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;

  return {
    focalMin: min,
    focalMax: max,
    focalLabel: match[2] ? `${match[1]}\u2013${match[2]}mm` : `${match[1]}mm`,
    kind: match[2] ? 'zoom' : 'prime',
  };
};

const buildFocalChart = (items, extent) => {
  const hasRange = extent.max > extent.min;
  const logMin = Math.log(extent.min || 1);
  const logMax = Math.log(extent.max > extent.min ? extent.max : (extent.min || 0) + 1);
  const position = (value) => {
    if (!Number.isFinite(value) || !hasRange) return 0;
    return ((Math.log(value) - logMin) / (logMax - logMin)) * 100;
  };
  const marks = [...items]
    .sort(
      (a, b) =>
        Number(a.focal.focalMin) - Number(b.focal.focalMin) ||
        Number(a.focal.focalMax) - Number(b.focal.focalMax),
    )
    .map((product) => {
      const start = position(product.focal.focalMin);
      const end = Math.max(position(product.focal.focalMax), start + 1.2);

      return {
        start,
        span: end - start,
        kind: product.focal.kind,
        label: product.focal.focalLabel,
        name: product.name,
        brand: product.brand,
        slug: product.slug,
      };
    });
  const ticks = [24, 35, 50, 85, 135, 200]
    .filter((mm) => mm >= extent.min && mm <= extent.max)
    .map((mm) => ({ mm, pos: position(mm) }));

  return { marks, ticks };
};

const accessoryRoles = {
  'manfrotto-befree-advanced-tripod': {
    role: 'Support',
    note: 'A steady base for long exposures, timelapse and product work.',
  },
  'dji-rs-4-gimbal': {
    role: 'Support',
    note: 'Balanced motors for smooth movement with mirrorless and phone rigs.',
  },
  'sandisk-extreme-pro-128gb-sdxc': {
    role: 'Storage',
    note: 'Fast UHS-I capacity for 4K video and long burst sequences.',
  },
  'peak-design-everyday-sling-10l': {
    role: 'Carry',
    note: 'Ten litres of padded carry that stays out of the way on a shoot.',
  },
};

let productsCache = [];

const loadProducts = async () => {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.name, p.description, p.discounted_price, p.real_price, p.brand, p.ratings, p.amount_sold, p.date_added, p.image, p.image_background, p.is_featured,
            COALESCE(array_agg(pt.type) FILTER (WHERE pt.type IS NOT NULL), '{}') AS type
     FROM products p
     LEFT JOIN product_types pt ON pt.product_id = p.id
     GROUP BY p.id
     ORDER BY p.id`,
  );

  productsCache = rows.map((row) => ({
    ...row,
    discounted_price: Number(row.discounted_price),
    real_price: Number(row.real_price),
    ratings: row.ratings !== null ? Number(row.ratings) : null,
    amount_sold: Number(row.amount_sold),
    is_featured: Boolean(row.is_featured),
    type: Array.isArray(row.type) ? row.type : [],
  }));

  const navDropdowns = {
    cameras: productsCache
      .filter((product) => product.type.includes('camera'))
      .slice(0, 8)
      .map((product) => ({ slug: product.slug, name: product.name, brand: product.brand })),
    lenses: productsCache
      .filter((product) => product.type.includes('lenses'))
      .slice(0, 8)
      .map((product) => ({ slug: product.slug, name: product.name, brand: product.brand })),
    accessories: productsCache
      .filter((product) => product.type.includes('accessories') && !product.type.includes('camera'))
      .slice(0, 6)
      .map((product) => ({ slug: product.slug, name: product.name, brand: product.brand })),
  };

  app.locals.navDropdowns = navDropdowns;
  app.locals.productsCache = productsCache;
  return productsCache;
};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(expressLayouts);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'lenser-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use((req, res, next) => {
  const user = req.session.user || null;
  res.locals.user = user;
  res.locals.userInitials = user
    ? `${(user.first_name || '').charAt(0)}${(user.last_name || '').charAt(0)}`.toUpperCase()
    : '';
  next();
});

app.use(async (req, res, next) => {
  res.locals.cartCount = 0;
  res.locals.cartLines = 0;
  res.locals.cartSubtotal = 0;
  res.locals.cartPreview = [];
  res.locals.wishlistIds = [];

  if (!req.session.user) return next();

  try {
    const [stateResult, previewResult] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(quantity), 0) FROM cart_items WHERE user_id = $1) AS cart_count,
           (SELECT COUNT(*) FROM cart_items WHERE user_id = $1) AS cart_lines,
           (SELECT COALESCE(SUM(ci.quantity * p.discounted_price), 0)
              FROM cart_items ci
              JOIN products p ON p.id = ci.product_id
              WHERE ci.user_id = $1) AS cart_subtotal,
           (SELECT COALESCE(array_agg(product_id), '{}') FROM wishlist_items WHERE user_id = $1) AS wishlist_ids`,
        [req.session.user.id],
      ),
      pool.query(
        `SELECT ci.quantity, p.slug, p.name, p.brand, p.discounted_price,
                p.image, p.image_background
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1
         ORDER BY ci.created_at DESC
         LIMIT 3`,
        [req.session.user.id],
      ),
    ]);

    const state = stateResult.rows[0];
    res.locals.cartCount = Number(state.cart_count) || 0;
    res.locals.cartLines = Number(state.cart_lines) || 0;
    res.locals.cartSubtotal = Number(state.cart_subtotal) || 0;
    res.locals.cartPreview = previewResult.rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      discounted_price: Number(row.discounted_price),
    }));
    res.locals.wishlistIds = (state.wishlist_ids || []).map(Number);
  } catch (error) {
    console.error('Could not load cart state', error);
  }

  next();
});

app.use(async (req, res, next) => {
  if (productsCache.length === 0) {
    try {
      await loadProducts();
    } catch (error) {
      console.error('Failed to load products from database', error);
    }
  }
  next();
});

app.locals.formatPrice = (value) => phpPrice.format(Number(value));
app.locals.formatMonth = (date) => monthYear.format(new Date(date));
app.locals.formatShortDate = (date) => shortDate.format(new Date(date));
app.locals.formatOrderDate = (date) => orderDate.format(new Date(date));
app.locals.formatDateTime = (date) => orderDateTime.format(new Date(date));
app.locals.discountPercent = discountPercent;
app.locals.savings = savings;
app.locals.productIcon = productIcon;
app.locals.currentYear = new Date().getFullYear();
app.locals.freeShippingThreshold = FREE_SHIPPING_THRESHOLD;
app.locals.shippingFee = SHIPPING_FEE;
app.locals.orderStatusLabel = (status) => orderStatusCopy[status] || 'Order placed';
app.locals.searchQuickLinks = SEARCH_QUICK_LINKS;

app.get('/', (req, res) => {
  const featuredProducts = productsCache
    .filter((product) => product.is_featured)
    .slice(0, 4);
  const newProducts = [...productsCache]
    .sort((a, b) => new Date(b.date_added) - new Date(a.date_added))
    .slice(0, 4);

  res.render('home', {
    currentPath: req.path,
    featuredProducts,
    newProducts,
  });
});

app.get('/featured', (req, res) => {
  const featuredProducts = productsCache.filter((product) => product.is_featured);

  res.render('featured', {
    currentPath: req.path,
    featuredProducts,
  });
});

app.get('/deals', (req, res) => {
  const deals = productsCache
    .filter((product) => discountPercent(product) > 0)
    .sort((a, b) => discountPercent(b) - discountPercent(a));

  res.render('deals', {
    currentPath: req.path,
    deals,
    dealOfWeek: deals[0],
    otherDeals: deals.slice(1),
  });
});

app.get('/best-sellers', (req, res) => {
  const bestSellers = [...productsCache]
    .sort((a, b) => Number(b.amount_sold) - Number(a.amount_sold))
    .slice(0, 10);
  const brandTally = Object.entries(
    bestSellers.reduce((acc, product) => {
      acc[product.brand] = (acc[product.brand] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  res.render('best-sellers', {
    currentPath: req.path,
    bestSellers,
    podium: bestSellers.slice(0, 3),
    runnersUp: bestSellers.slice(3),
    brandTally,
    totalSold: bestSellers.reduce((sum, product) => sum + Number(product.amount_sold), 0),
  });
});

app.get('/new-arrivals', (req, res) => {
  const newArrivals = [...productsCache]
    .sort((a, b) => new Date(b.date_added) - new Date(a.date_added))
    .slice(0, 12);
  const arrivalGroups = [];

  newArrivals.forEach((product) => {
    const label = monthYear.format(new Date(product.date_added));
    let group = arrivalGroups.find((entry) => entry.label === label);

    if (!group) {
      group = { label, items: [] };
      arrivalGroups.push(group);
    }
    group.items.push(product);
  });

  res.render('new-arrivals', {
    currentPath: req.path,
    newArrivals,
    justLanded: newArrivals.slice(0, 4),
    arrivalGroups,
  });
});

app.get('/cameras', (req, res) => {
  const items = productsCache.filter((product) => product.type.includes('camera'));
  const brandMap = new Map();

  items.forEach((product) => {
    if (!brandMap.has(product.brand)) brandMap.set(product.brand, []);
    brandMap.get(product.brand).push(product);
  });

  const brands = Array.from(brandMap, ([brand, products]) => ({ brand, products })).sort(
    (a, b) => b.products.length - a.products.length || a.brand.localeCompare(b.brand),
  );
  const prices = items.map((product) => Number(product.discounted_price));
  const heroPick =
    [...items].sort((a, b) => (Number(b.ratings) || 0) - (Number(a.ratings) || 0))[0] || null;

  res.render('cameras', {
    currentPath: req.path,
    items,
    brands,
    heroPick,
    priceFloor: prices.length ? Math.min(...prices) : 0,
    priceCeil: prices.length ? Math.max(...prices) : 0,
  });
});

app.get('/lenses', (req, res) => {
  const items = productsCache
    .filter((product) => product.type.includes('lenses'))
    .map((product) => ({ ...product, focal: parseFocal(product.name) }));
  const focals = items
    .flatMap((product) => [product.focal.focalMin, product.focal.focalMax])
    .filter((value) => Number.isFinite(value));
  const extent = {
    min: focals.length ? Math.min(...focals) : 0,
    max: focals.length ? Math.max(...focals) : 0,
  };

  res.render('lenses', {
    currentPath: req.path,
    items,
    primes: items.filter((product) => product.focal.kind === 'prime'),
    zooms: items.filter((product) => product.focal.kind === 'zoom'),
    extent,
    chart: buildFocalChart(items, extent),
  });
});

app.get('/accessories', (req, res) => {
  const items = productsCache
    .filter(
      (product) => product.type.includes('accessories') && !product.type.includes('camera'),
    )
    .map((product) => {
      const meta = accessoryRoles[product.slug] || {};
      return {
        ...product,
        role: meta.role || 'Kit',
        roleNote: meta.note || '',
      };
    });

  res.render('accessories', {
    currentPath: req.path,
    items,
  });
});

app.get('/search', (req, res) => {
  const searchQuery = normalizeSearchQuery(req.query.q);
  const requestedType = typeof req.query.type === 'string' ? req.query.type : '';
  const activeType =
    searchQuery && SEARCH_TYPES.some((item) => item.value === requestedType)
      ? requestedType
      : '';
  const results = searchQuery ? searchProducts(searchQuery, activeType) : [];
  const popularProducts = [...productsCache]
    .sort((a, b) => Number(b.amount_sold) - Number(a.amount_sold))
    .slice(0, 4);
  const typeFilters = [
    { label: 'All gear', href: searchHref(searchQuery), active: activeType === '' },
    ...SEARCH_TYPES.map((item) => ({
      label: item.label,
      href: searchHref(searchQuery, item.value),
      active: activeType === item.value,
    })),
  ];
  const returnPath = searchQuery ? searchHref(searchQuery, activeType) : '/search';

  res.render('search', {
    currentPath: '/search',
    searchQuery,
    results,
    activeType,
    typeFilters,
    popularProducts,
    returnPath,
  });
});

app.get('/product/:slug', (req, res) => {
  const product = productsCache.find((entry) => entry.slug === req.params.slug);
  if (!product) {
    return res.status(404).send('Product not found');
  }

  const typeLabels = {
    camera: 'Cameras',
    lenses: 'Lenses',
    accessories: 'Accessories',
  };

  const primaryType = Array.isArray(product.type) ? product.type.find((t) => typeLabels[t]) : null;
  const categoryLabel = primaryType ? typeLabels[primaryType] : product.type?.[0] || 'Products';
  const categoryHref =
    primaryType === 'camera'
      ? '/cameras'
      : primaryType === 'lenses'
        ? '/lenses'
        : primaryType === 'accessories'
          ? '/accessories'
          : '/';

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: categoryLabel, href: categoryHref },
    { label: product.name },
  ];

  const related = productsCache
    .filter((entry) => entry.slug !== product.slug && entry.type.some((type) => product.type.includes(type)))
    .sort((a, b) => {
      const aSameBrand = a.brand === product.brand ? 1 : 0;
      const bSameBrand = b.brand === product.brand ? 1 : 0;
      if (aSameBrand !== bSameBrand) return bSameBrand - aSameBrand;
      const ratingDiff = Number(b.ratings || 0) - Number(a.ratings || 0);
      if (ratingDiff !== 0) return ratingDiff;
      const soldDiff = Number(b.amount_sold || 0) - Number(a.amount_sold || 0);
      if (soldDiff !== 0) return soldDiff;
      return new Date(b.date_added) - new Date(a.date_added);
    })
    .slice(0, 4);

  const savingsAmount = Math.max(Number(product.real_price) - Number(product.discounted_price), 0);
  const savingsPercentValue = Number(product.real_price) > Number(product.discounted_price)
    ? Math.round((1 - Number(product.discounted_price) / Number(product.real_price)) * 100)
    : 0;
  const specContent = productSpecs[product.slug] || fallbackSpecContent(product);

  res.render('product', {
    currentPath: req.path,
    product,
    related,
    categoryLabel,
    categoryHref,
    breadcrumbs,
    savingsAmount,
    savingsPercentValue,
    specContent,
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    currentPath: req.path,
  });
});

const redirectIfAuth = (req, res, next) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  next();
};

app.get('/register', redirectIfAuth, (req, res) => {
  res.render('register', {
    currentPath: req.path,
    error: null,
    values: {}
  });
});

app.post('/register', redirectIfAuth, async (req, res) => {
  const { firstName, lastName, email, password } = req.body || {};
  const formValues = {
    firstName: firstName || '',
    lastName: lastName || '',
    email: email || ''
  };

  if (!firstName || !lastName || !email || !password) {
    return res.render('register', {
      currentPath: '/register',
      error: 'All fields are required.',
      values: formValues
    });
  }

  if (String(password).length < 8) {
    return res.render('register', {
      currentPath: '/register',
      error: 'Password must be at least 8 characters.',
      values: formValues
    });
  }

  const emailNorm = String(email).trim().toLowerCase();

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [emailNorm]);
    if (existing.rows.length > 0) {
      return res.render('register', {
        currentPath: '/register',
        error: 'An account with that email already exists.',
        values: formValues
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name',
      [emailNorm, passwordHash, String(firstName).trim(), String(lastName).trim()]
    );

    const user = rows[0];
    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.redirect('/login');
      }
      req.session.user = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      };
      req.session.save(() => {
        res.redirect('/');
      });
    });
  } catch (error) {
    console.error('Register error', error);
    return res.render('register', {
      currentPath: '/register',
      error: 'Something went wrong. Please try again.',
      values: formValues
    });
  }
});

app.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', {
    currentPath: req.path,
    error: null,
    values: {},
    next: safeNext(req.query.next, '')
  });
});

app.post('/login', redirectIfAuth, async (req, res) => {
  const { email, password } = req.body || {};
  const formValues = { email: email || '' };
  const next = safeNext(req.body.next, '/');

  if (!email || !password) {
    return res.render('login', {
      currentPath: '/login',
      error: 'Email and password are required.',
      values: formValues,
      next
    });
  }

  const emailNorm = String(email).trim().toLowerCase();

  try {
    const { rows } = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE LOWER(email) = $1',
      [emailNorm]
    );

    if (rows.length === 0) {
      return res.render('login', {
        currentPath: '/login',
        error: 'Invalid email or password.',
        values: formValues,
        next
      });
    }

    const user = rows[0];
    const match = await bcrypt.compare(String(password), user.password_hash);

    if (!match) {
      return res.render('login', {
        currentPath: '/login',
        error: 'Invalid email or password.',
        values: formValues,
        next
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.redirect('/login');
      }
      req.session.user = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      };
      req.session.save(() => {
        res.redirect(next);
      });
    });
  } catch (error) {
    console.error('Login error', error);
    return res.render('login', {
      currentPath: '/login',
      error: 'Something went wrong. Please try again.',
      values: formValues,
      next
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

const cartTotals = (items) => {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.discounted_price) * Number(item.quantity),
    0,
  );
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const shipping = shippingFor(subtotal, items.length > 0);

  return { subtotal, shipping, total: subtotal + shipping, itemCount };
};

const loadCart = async (userId) => {
  const { rows } = await pool.query(
    `SELECT ci.product_id, ci.quantity, p.slug, p.name, p.brand, p.discounted_price,
            p.image, p.image_background
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1
     ORDER BY ci.created_at`,
    [userId],
  );

  const items = rows.map((row) => ({
    ...row,
    product_id: Number(row.product_id),
    quantity: Number(row.quantity),
    discounted_price: Number(row.discounted_price),
  }));

  return { items, ...cartTotals(items) };
};

const loadAccount = async (userId) => {
  const [userResult, ordersResult, savedResult] = await Promise.all([
    pool.query(
      'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
      [userId],
    ),
    pool.query(
      `SELECT o.id, o.status, o.total, o.payment_method, o.created_at,
              COALESCE(SUM(oi.quantity), 0)::int AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [userId],
    ),
    pool.query(
      `SELECT p.*
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId],
    ),
  ]);

  if (!userResult.rows.length) return null;

  return {
    user: userResult.rows[0],
    orders: ordersResult.rows.map((order) => ({
      ...order,
      id: Number(order.id),
      total: Number(order.total),
      item_count: Number(order.item_count),
    })),
    savedProducts: savedResult.rows.map((product) => ({
      ...product,
      id: Number(product.id),
      discounted_price: Number(product.discounted_price),
      real_price: Number(product.real_price),
      ratings: product.ratings !== null ? Number(product.ratings) : null,
      amount_sold: Number(product.amount_sold),
    })),
  };
};

const renderAccountPage = async (req, res, { errors = {}, profileValues = null, status = null } = {}) => {
  const data = await loadAccount(req.session.user.id);
  if (!data) {
    return req.session.destroy(() => res.redirect('/login'));
  }

  const { user, orders, savedProducts } = data;
  const initials = `${(user.first_name || '').charAt(0)}${(user.last_name || '').charAt(0)}`.toUpperCase();

  return res.render('account', {
    currentPath: '/account',
    account: user,
    initials,
    orders,
    savedProducts,
    errors,
    status,
    profileValues: profileValues || {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
    },
  });
};

app.get('/cart', requireAuth, async (req, res) => {
  try {
    const cart = await loadCart(req.session.user.id);
    res.render('cart', { currentPath: '/cart', cart });
  } catch (error) {
    console.error('Cart error', error);
    res.status(500).send('Could not load your cart.');
  }
});

app.post('/cart/add', requireAuth, async (req, res) => {
  const productId = Number(req.body.productId);
  const product = productsCache.find((entry) => Number(entry.id) === productId);
  const redirectTo = req.body.checkout === '1' ? '/checkout' : safeNext(req.body.next, '/cart');
  const quantity = Math.min(10, Math.max(1, Number(req.body.quantity) || 1));

  if (!product) return res.redirect(redirectTo);

  try {
    await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 10), updated_at = NOW()`,
      [req.session.user.id, productId, quantity],
    );
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Add to cart error', error);
    res.status(500).send('Could not add that item to your cart.');
  }
});

app.post('/cart/update', requireAuth, async (req, res) => {
  const productId = Number(req.body.productId);
  const quantity = Math.min(10, Math.max(1, Number(req.body.quantity) || 1));

  try {
    await pool.query(
      'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE user_id = $2 AND product_id = $3',
      [quantity, req.session.user.id, productId],
    );
    res.redirect('/cart');
  } catch (error) {
    console.error('Cart update error', error);
    res.status(500).send('Could not update your cart.');
  }
});

app.post('/cart/remove', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
      req.session.user.id,
      Number(req.body.productId),
    ]);
    res.redirect('/cart');
  } catch (error) {
    console.error('Cart remove error', error);
    res.status(500).send('Could not update your cart.');
  }
});

app.post('/wishlist/toggle', requireAuth, async (req, res) => {
  const productId = Number(req.body.productId);
  const redirectTo = safeNext(req.body.next, '/account#saved');

  if (!productsCache.some((entry) => Number(entry.id) === productId)) {
    return res.redirect(redirectTo);
  }

  try {
    const removed = await pool.query(
      'DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2 RETURNING product_id',
      [req.session.user.id, productId],
    );

    if (!removed.rowCount) {
      await pool.query(
        'INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.session.user.id, productId],
      );
    }

    res.redirect(redirectTo);
  } catch (error) {
    console.error('Wishlist error', error);
    res.status(500).send('Could not update your saved gear.');
  }
});

app.get('/checkout', requireAuth, async (req, res) => {
  try {
    const cart = await loadCart(req.session.user.id);
    if (!cart.items.length) return res.redirect('/cart');

    const user = req.session.user;
    res.render('checkout', {
      currentPath: '/checkout',
      cart,
      errors: {},
      values: {
        shipping_name: `${user.first_name} ${user.last_name}`.trim(),
        shipping_phone: '',
        shipping_address: '',
        shipping_city: '',
        shipping_province: '',
        shipping_postal: '',
        payment_method: 'cod',
        notes: '',
      },
    });
  } catch (error) {
    console.error('Checkout error', error);
    res.status(500).send('Could not load checkout.');
  }
});

app.post('/checkout', requireAuth, async (req, res) => {
  const values = {
    shipping_name: String(req.body.shipping_name || '').trim(),
    shipping_phone: String(req.body.shipping_phone || '').trim(),
    shipping_address: String(req.body.shipping_address || '').trim(),
    shipping_city: String(req.body.shipping_city || '').trim(),
    shipping_province: String(req.body.shipping_province || '').trim(),
    shipping_postal: String(req.body.shipping_postal || '').trim(),
    payment_method: String(req.body.payment_method || 'cod'),
    notes: String(req.body.notes || '').trim(),
  };
  const errors = {};

  if (!values.shipping_name) errors.shipping_name = 'Enter the recipient name.';
  if (!values.shipping_phone) errors.shipping_phone = 'Enter a contact number.';
  if (!values.shipping_address) errors.shipping_address = 'Enter the delivery address.';
  if (!values.shipping_city) errors.shipping_city = 'Enter the city or municipality.';
  if (!values.shipping_province) errors.shipping_province = 'Enter the province.';
  if (values.shipping_name.length > 200) errors.shipping_name = 'Keep this under 200 characters.';
  if (values.shipping_phone.length > 50) errors.shipping_phone = 'Keep this under 50 characters.';
  if (values.shipping_city.length > 100) errors.shipping_city = 'Keep this under 100 characters.';
  if (values.shipping_province.length > 100) {
    errors.shipping_province = 'Keep this under 100 characters.';
  }
  if (values.shipping_postal.length > 20) errors.shipping_postal = 'Keep this under 20 characters.';
  if (!['cod', 'bank_transfer'].includes(values.payment_method)) {
    values.payment_method = 'cod';
  }

  try {
    const cart = await loadCart(req.session.user.id);
    if (!cart.items.length) return res.redirect('/cart');

    if (Object.keys(errors).length) {
      return res.status(422).render('checkout', {
        currentPath: '/checkout',
        cart,
        errors,
        values,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `INSERT INTO orders (
           user_id, payment_method, subtotal, shipping_fee, total,
           shipping_name, shipping_phone, shipping_address, shipping_city,
           shipping_province, shipping_postal, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          req.session.user.id,
          values.payment_method,
          cart.subtotal,
          cart.shipping,
          cart.total,
          values.shipping_name,
          values.shipping_phone,
          values.shipping_address,
          values.shipping_city,
          values.shipping_province,
          values.shipping_postal || null,
          values.notes || null,
        ],
      );
      const orderId = orderResult.rows[0].id;

      for (const item of cart.items) {
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, product_name, product_slug, product_image,
             image_background, unit_price, quantity, line_total
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            orderId,
            item.product_id,
            item.name,
            item.slug,
            item.image,
            item.image_background,
            item.discounted_price,
            item.quantity,
            item.discounted_price * item.quantity,
          ],
        );
      }

      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.session.user.id]);
      await client.query('COMMIT');
      res.redirect(`/account/orders/${orderId}?placed=1`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Place order error', error);
    res.status(500).send('Could not place your order.');
  }
});

app.get('/account', requireAuth, async (req, res) => {
  try {
    await renderAccountPage(req, res, { status: req.query.status || null });
  } catch (error) {
    console.error('Account error', error);
    res.status(500).send('Could not load your account.');
  }
});

app.post('/account/profile', requireAuth, async (req, res) => {
  const profileValues = {
    firstName: String(req.body.firstName || '').trim(),
    lastName: String(req.body.lastName || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
  };
  const errors = {};

  if (!profileValues.firstName) errors.firstName = 'Enter your first name.';
  if (!profileValues.lastName) errors.lastName = 'Enter your last name.';
  if (profileValues.firstName.length > 100) errors.firstName = 'Keep this under 100 characters.';
  if (profileValues.lastName.length > 100) errors.lastName = 'Keep this under 100 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileValues.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (profileValues.email.length > 255) errors.email = 'Keep this under 255 characters.';

  try {
    if (!errors.email) {
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2',
        [profileValues.email, req.session.user.id],
      );
      if (existing.rows.length) errors.email = 'That email is already in use.';
    }

    if (Object.keys(errors).length) {
      return await renderAccountPage(req, res, { errors, profileValues });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, email = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, first_name, last_name`,
      [profileValues.firstName, profileValues.lastName, profileValues.email, req.session.user.id],
    );

    const updated = rows[0];
    req.session.user = {
      id: updated.id,
      email: updated.email,
      first_name: updated.first_name,
      last_name: updated.last_name,
    };
    req.session.save(() => {
      res.redirect('/account?status=profile#profile');
    });
  } catch (error) {
    console.error('Profile update error', error);
    res.status(500).send('Could not update your profile.');
  }
});

app.post('/account/password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const errors = {};

  if (!currentPassword) errors.currentPassword = 'Enter your current password.';
  if (newPassword.length < 8) errors.newPassword = 'Use at least 8 characters.';
  if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

  try {
    if (!errors.currentPassword && !errors.newPassword) {
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
        req.session.user.id,
      ]);
      const match = rows.length
        ? await bcrypt.compare(currentPassword, rows[0].password_hash)
        : false;

      if (!match) errors.currentPassword = 'That password is not correct.';
    }

    if (Object.keys(errors).length) {
      return await renderAccountPage(req, res, { errors });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, req.session.user.id],
    );
    res.redirect('/account?status=password#security');
  } catch (error) {
    console.error('Password update error', error);
    res.status(500).send('Could not update your password.');
  }
});

app.get('/account/orders/:id', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(404).send('Order not found');

  try {
    const [orderResult, itemsResult] = await Promise.all([
      pool.query(
        `SELECT id, status, payment_method, subtotal, shipping_fee, total,
                shipping_name, shipping_phone, shipping_address, shipping_city,
                shipping_province, shipping_postal, notes, created_at
         FROM orders
         WHERE id = $1 AND user_id = $2`,
        [orderId, req.session.user.id],
      ),
      pool.query(
        `SELECT product_name, product_slug, product_image, image_background,
                unit_price, quantity, line_total
         FROM order_items
         WHERE order_id = $1
         ORDER BY id`,
        [orderId],
      ),
    ]);

    if (!orderResult.rows.length) return res.status(404).send('Order not found');

    res.render('order', {
      currentPath: '/account',
      order: orderResult.rows[0],
      items: itemsResult.rows,
      justPlaced: req.query.placed === '1',
    });
  } catch (error) {
    console.error('Order error', error);
    res.status(500).send('Could not load that order.');
  }
});

loadProducts()
  .then(() => {
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
  })
  .catch((error) => {
    console.error('Failed to initialize products', error);
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
  });
