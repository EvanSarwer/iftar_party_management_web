CREATE TABLE IF NOT EXISTS event_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  tagline VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  contribution DECIMAL(10,2) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  collection_deadline_label VARCHAR(255) NOT NULL,
  date_label VARCHAR(255) NOT NULL,
  venue VARCHAR(255) NOT NULL,
  whats_app_number VARCHAR(50) NOT NULL,
  bkash VARCHAR(100) NOT NULL,
  collection_points_json LONGTEXT NOT NULL,
  note TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendees (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  normalized_phone VARCHAR(32) NOT NULL,
  status ENUM('pending', 'confirmed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  UNIQUE KEY uniq_attendees_normalized_name (normalized_name),
  UNIQUE KEY uniq_attendees_normalized_phone (normalized_phone)
);