# Mizaniya AI — vNext Admin Completion

This batch adds production-safe admin user management and an audit trail on top of the current working baseline.

## Added
- Enable/disable Firebase Authentication users from Admin Dashboard.
- Promote/demote users between `user` and `admin` using Firebase custom claims.
- Safety guards prevent an admin from disabling or demoting their own active account.
- Persistent Firestore `adminAuditLogs` collection for role/status changes.
- Admin Audit Log UI showing actor, target, action and timestamp.
- Existing feature flags, metrics and user directory remain intact.

## Smoke test
1. Open Admin Dashboard.
2. Disable a non-admin test account and verify it cannot authenticate with a newly issued token/session.
3. Re-enable it.
4. Promote a test user to Admin, sign out/in on that test account, verify Admin access.
5. Demote it and sign out/in again.
6. Confirm every action appears in Admin Audit Log.

Do not test role changes on the primary owner account.
