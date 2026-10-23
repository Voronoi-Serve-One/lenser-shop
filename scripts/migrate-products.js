const pool = require('../config/db');
const products = require('../data/products.json');
const productAssets = require('../data/product-assets.json');
const fs = require('fs');
const path = require('path');

const assetBySlug = new Map(
  productAssets.map((asset) => [asset.slug, asset]),
);

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schemaSql = fs.readFileSync(
      path.join(__dirname, '..', 'schema.sql'),
      'utf8',
    );
    await client.query(schemaSql);

    await client.query('TRUNCATE product_types, products RESTART IDENTITY CASCADE');

    for (const product of products) {
      const asset = assetBySlug.get(product.slug);
      const imageBackground =
        asset?.background && /^#[0-9a-f]{6}$/i.test(asset.background)
          ? asset.background
          : null;

      const result = await client.query(
        `INSERT INTO products (slug, name, description, discounted_price, real_price, brand, ratings, amount_sold, date_added, image, image_background, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          product.slug,
          product.name,
          product.description,
          product.discounted_price,
          product.real_price,
          product.brand,
          product.ratings,
          product.amount_sold,
          product.date_added,
          product.image,
          imageBackground,
          product.is_featured,
        ],
      );

      const productId = result.rows[0].id;
      const types = Array.isArray(product.type) ? product.type : [];
      for (const type of types) {
        await client.query(
          'INSERT INTO product_types (product_id, type) VALUES ($1, $2)',
          [productId, type],
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Migrated ${products.length} products`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
