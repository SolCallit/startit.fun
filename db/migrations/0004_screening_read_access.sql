-- 0004: the screening service account may READ the application data it screens.
-- It cannot read operator notes, evidence file contents (storage), fee/launch/payout data, or other users' profiles beyond display name.
create policy apps_screening_read on applications for select using (has_role('screening_service'));
create policy links_screening_read on application_links for select using (has_role('screening_service'));
create policy mplans_screening_read on milestone_plans for select using (has_role('screening_service'));
create policy evidence_meta_screening_read on evidence_files for select using (has_role('screening_service'));
create policy profiles_screening_read on profiles for select using (has_role('screening_service'));
