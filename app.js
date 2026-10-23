const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const pool = require('./config/db');

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
app.locals.discountPercent = discountPercent;
app.locals.savings = savings;
app.locals.productIcon = productIcon;
app.locals.currentYear = new Date().getFullYear();

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

app.get('/product/:slug', (req, res) => {
  const product = productsCache.find((entry) => entry.slug === req.params.slug);
  if (!product) {
    return res.status(404).send('Product not found');
  }
  const related = productsCache
    .filter((entry) => entry.slug !== product.slug && entry.type.some((type) => product.type.includes(type)))
    .slice(0, 4);
  res.render('product', {
    currentPath: '/product',
    product,
    related,
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    currentPath: req.path,
  });
});

loadProducts()
  .then(() => {
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
  })
  .catch((error) => {
    console.error('Failed to initialize products', error);
    app.listen(3000, () => console.log('Server running at http://localhost:3000'));
  });
