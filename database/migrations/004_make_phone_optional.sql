ALTER TABLE attendees
  MODIFY COLUMN phone VARCHAR(32) NULL,
  MODIFY COLUMN normalized_phone VARCHAR(32) NULL,
  DROP INDEX uniq_attendees_normalized_phone;
