
# Supabase DB Triggers

There are some protected schemas in Supabase that are not directly accessible through the dashboard or included in migrations. This includes schemas for auditing, logging, and other internal processes that may require special permissions to access.

However, we still might need to create triggers in these schemas for various reasons.

## User Sign-up

This trigger is automatically invoked when a new user is created in the `auth.users` table. We associate ith with the handle_new_user() function, which is responsible for handling the logic that should occur when a new user is created such as creating their profile or sending a welcome email.

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE handle_new_user();
```
