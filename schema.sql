CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  discounted_price INTEGER NOT NULL,
  real_price INTEGER NOT NULL,
  brand VARCHAR(100),
  ratings NUMERIC(3,1),
  amount_sold INTEGER DEFAULT 0,
  date_added DATE NOT NULL,
  image VARCHAR(255),
  image_background VARCHAR(9),
  is_featured BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS product_types (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  PRIMARY KEY (product_id, type)
);
