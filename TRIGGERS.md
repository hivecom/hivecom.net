# Supabase DB Triggers

There are some protected schemas in Supabase that are not directly accessible through the dashboard or included in migrations. This includes schemas for auditing, logging, and other internal processes that may require special permissions to access.

However, we still might need to create triggers in these schemas for various reasons.

## User Sign-up

This trigger is automatically invoked when a new user is created in the `auth.users` table. We associate it with the handle_new_user() function, which is responsible for handling the logic that should occur when a new user is created such as creating their profile or sending a welcome email.

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE handle_new_user();
```

## Automatic Audit Field Updates

The database automatically maintains audit fields (`created_at`, `created_by`, `modified_at`, `modified_by`) through triggers defined in the migrations. These triggers ensure that:

- `modified_at` is always set to the current timestamp on UPDATE
- `modified_by` is always set to the current authenticated user ID on UPDATE
- `created_at` and `created_by` are protected from modification during updates

This eliminates the need for application-level audit field management and ensures consistency across all database updates.

**Tables with automatic audit field triggers:**

- announcements
- complaints
- events
- expenses
- games
- gameservers
- profiles
- referendums
- referendum_votes
- servers

**Note:** You no longer need to manually set `modified_at` and `modified_by` in your application code - the triggers handle this automatically.
