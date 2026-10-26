-- The 2026 friendly. Future events: insert another row into events +
-- event_settings and flip is_active; nothing in the app is hard-coded to 2026.

insert into public.events (slug, name, sport, event_date, start_time, end_time, venue, format_label, tagline, is_active)
values (
  'friendly-2026',
  'Xinmin Alumni Volleyball Friendly 2026',
  'volleyball',
  '2026-11-21',
  '09:00',
  '14:00',
  'Xinmin Secondary School',
  '4-Way Round Robin',
  'Reconnect. Compete. Support the next generation.',
  true
);

insert into public.event_settings (event_id, open_slots, reserved_slots, reserved_label, other_slots, other_slots_label, min_roster, max_roster)
select id, 2, 1, 'Defending champion alumni team', 1, 'Current Xinmin B Division school team', 10, 12
from public.events where slug = 'friendly-2026';
