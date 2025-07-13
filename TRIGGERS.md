# Supabase DB Triggers

There are some protected schemas in Supabase that are not directly accessible through the dashboard or included in migrations. This includes schemas for auditing, logging, and other internal processes that may require special permissions to access.

However, we still might need to create triggers in these schemas for various reasons.

## User Sign-up

There are multiple triggers that are automatically invoked when a new user is created in the `auth.users` table:

### Profile Creation Trigger

This trigger creates a new profile record when a user signs up:

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE handle_new_user();
```

### Discord Notification Trigger

This trigger sends a Discord notification when a new user signs up:

```sql
CREATE TRIGGER trigger_notify_discord_new_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION notify_discord_new_signup();
```

The `handle_new_user()` function is responsible for creating a profile record in the `public.profiles` table. The `notify_discord_new_signup()` function sends a webhook notification to Discord with the new user's details including email, signup date, and user ID.

## User Deletion

This trigger is automatically invoked when a user is deleted from the `auth.users` table:

### Discord Notification Trigger

This trigger sends a Discord notification when a user account is deleted:

```sql
CREATE TRIGGER trigger_notify_discord_user_deleted
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION notify_discord_user_deleted();
```

The `notify_discord_user_deleted()` function sends a webhook notification to Discord with the deleted user's details including email, user ID, and deletion timestamp.

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
