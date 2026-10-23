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
      .filter((product) => product.type.includes('accessories'))
      .slice(0, 6)
      .map((product) => ({ slug: product.slug, name: product.name, brand: product.brand })),
  };

  app.locals.navDropdowns = navDropdowns;
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

const categoryRoutes = [
  { path: '/cameras', type: 'camera', title: 'Cameras' },
  { path: '/lenses', type: 'lenses', title: 'Lenses' },
  { path: '/accessories', type: 'accessories', title: 'Accessories' },
];

for (const route of categoryRoutes) {
  app.get(route.path, (req, res) => {
    const items = productsCache.filter((product) => product.type.includes(route.type));
    res.render('category', {
      currentPath: req.path,
      title: route.title,
      items,
    });
  });
}

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
