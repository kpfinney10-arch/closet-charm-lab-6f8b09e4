INSERT INTO public.facilities (name, type, address, city, state, zip, contact_name, phone)
VALUES
  ('Sunrise Hospital', 'hospital', '100 Main St', 'Anytown', 'CA', '90210', 'Front Desk', '555-0100'),
  ('Evergreen Funeral Home', 'funeral_home', '500 Oak Ave', 'Anytown', 'CA', '90211', 'Director', '555-0200')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicles (name, make, model, year, license_plate, capacity)
VALUES ('Van 1', 'Ford', 'Transit', 2022, 'TEST-001', 1)
ON CONFLICT DO NOTHING;