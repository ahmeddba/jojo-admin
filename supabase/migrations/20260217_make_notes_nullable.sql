-- Make notes column optional in orders table
ALTER TABLE orders ALTER COLUMN notes DROP NOT NULL;
