-- Until AI screening is switched on, an admin can send a submitted application straight to human review.
-- The reason is required and stored in the decision history, so it's on record that screening was skipped.
insert into status_transition_rules (from_status, to_status, actor) values ('submitted', 'awaiting_review', 'admin')
on conflict do nothing;
