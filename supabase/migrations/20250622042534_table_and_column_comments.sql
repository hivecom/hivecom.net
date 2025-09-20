-- Add comments to Announcements table
COMMENT ON TABLE "public"."announcements" IS 'Community announcements and news posts that can be scheduled for future publication';

COMMENT ON COLUMN "public"."announcements"."id" IS 'Unique identifier for the announcement';

COMMENT ON COLUMN "public"."announcements"."created_at" IS 'Timestamp when the announcement was created';

COMMENT ON COLUMN "public"."announcements"."created_by" IS 'User ID of the announcement creator';

COMMENT ON COLUMN "public"."announcements"."modified_at" IS 'Timestamp when the announcement was last modified';

COMMENT ON COLUMN "public"."announcements"."modified_by" IS 'User ID of the last person to modify the announcement';

COMMENT ON COLUMN "public"."announcements"."title" IS 'Title/headline of the announcement';

COMMENT ON COLUMN "public"."announcements"."description" IS 'Brief description or summary of the announcement';

COMMENT ON COLUMN "public"."announcements"."markdown" IS 'Full announcement content in Markdown format';

COMMENT ON COLUMN "public"."announcements"."link" IS 'Optional external link related to the announcement';

COMMENT ON COLUMN "public"."announcements"."pinned" IS 'Whether this announcement should be pinned to the top';

COMMENT ON COLUMN "public"."announcements"."published_at" IS 'Timestamp when the announcement becomes visible to users (allows scheduling)';

-- Add comments to Complaints table
COMMENT ON TABLE "public"."complaints" IS 'User complaints and reports with admin responses and resolution tracking';

COMMENT ON COLUMN "public"."complaints"."id" IS 'Unique identifier for the complaint';

COMMENT ON COLUMN "public"."complaints"."created_at" IS 'Timestamp when the complaint was submitted';

COMMENT ON COLUMN "public"."complaints"."created_by" IS 'User ID of the person who submitted the complaint';

COMMENT ON COLUMN "public"."complaints"."message" IS 'The complaint message or description of the issue';

COMMENT ON COLUMN "public"."complaints"."response" IS 'Admin response to the complaint';

COMMENT ON COLUMN "public"."complaints"."responded_by" IS 'User ID of the admin who responded to the complaint';

COMMENT ON COLUMN "public"."complaints"."responded_at" IS 'Timestamp when the admin responded';

COMMENT ON COLUMN "public"."complaints"."acknowledged" IS 'Whether the complaint has been acknowledged by an admin';

COMMENT ON COLUMN "public"."complaints"."context_user" IS 'User ID related to the complaint context (e.g., user being reported)';

COMMENT ON COLUMN "public"."complaints"."context_gameserver" IS 'Game server ID related to the complaint context';

-- Add comments to Containers table
COMMENT ON TABLE "public"."containers" IS 'Docker containers and their current runtime states';

COMMENT ON COLUMN "public"."containers"."name" IS 'Unique name/identifier of the container';

COMMENT ON COLUMN "public"."containers"."created_at" IS 'Timestamp when the container record was created';

COMMENT ON COLUMN "public"."containers"."running" IS 'Whether the container is currently running';

COMMENT ON COLUMN "public"."containers"."healthy" IS 'Health status of the container (from health checks)';

COMMENT ON COLUMN "public"."containers"."reported_at" IS 'Timestamp when this status was last reported';

COMMENT ON COLUMN "public"."containers"."server" IS 'Server ID where this container is running';

COMMENT ON COLUMN "public"."containers"."started_at" IS 'Timestamp when the container was started';

-- Add missing comments to Events table columns
COMMENT ON COLUMN "public"."events"."link" IS 'Optional external link related to the event (e.g., registration, details)';

COMMENT ON COLUMN "public"."events"."duration_minutes" IS 'Duration of the event in minutes';

-- Add comments to Expenses table
COMMENT ON TABLE "public"."expenses" IS 'Monthly expenses and costs for running Hivecom infrastructure and services';

COMMENT ON COLUMN "public"."expenses"."id" IS 'Unique identifier for the expense record';

COMMENT ON COLUMN "public"."expenses"."created_at" IS 'Timestamp when the expense record was created';

COMMENT ON COLUMN "public"."expenses"."started_at" IS 'When this expense period started';

COMMENT ON COLUMN "public"."expenses"."ended_at" IS 'When this expense period ended (null for ongoing)';

COMMENT ON COLUMN "public"."expenses"."created_by" IS 'User ID who created this expense record';

COMMENT ON COLUMN "public"."expenses"."modified_by" IS 'User ID who last modified this expense record';

COMMENT ON COLUMN "public"."expenses"."amount_cents" IS 'Expense amount in cents (to avoid floating point precision issues)';

COMMENT ON COLUMN "public"."expenses"."name" IS 'Name/title of the expense';

COMMENT ON COLUMN "public"."expenses"."description" IS 'Detailed description of what this expense covers';

COMMENT ON COLUMN "public"."expenses"."url" IS 'Optional URL for expense documentation or receipts';

COMMENT ON COLUMN "public"."expenses"."modified_at" IS 'Timestamp when this expense was last modified';

-- Add comments to Games table
COMMENT ON TABLE "public"."games" IS 'Game definitions and metadata for games supported by the community';

COMMENT ON COLUMN "public"."games"."id" IS 'Unique identifier for the game';

COMMENT ON COLUMN "public"."games"."created_at" IS 'Timestamp when the game was added to the system';

COMMENT ON COLUMN "public"."games"."steam_id" IS 'Steam application ID for this game';

COMMENT ON COLUMN "public"."games"."name" IS 'Display name of the game';

COMMENT ON COLUMN "public"."games"."shorthand" IS 'Short abbreviation or code for the game';

COMMENT ON COLUMN "public"."games"."created_by" IS 'User ID who added this game to the system';

COMMENT ON COLUMN "public"."games"."modified_at" IS 'Timestamp when the game record was last modified';

COMMENT ON COLUMN "public"."games"."modified_by" IS 'User ID who last modified this game record';

-- Add comments to GameServers table
COMMENT ON TABLE "public"."gameservers" IS 'Game servers hosted or managed by Hivecom for the community';

COMMENT ON COLUMN "public"."gameservers"."id" IS 'Unique identifier for the game server';

COMMENT ON COLUMN "public"."gameservers"."created_at" IS 'Timestamp when the game server was added';

COMMENT ON COLUMN "public"."gameservers"."modified_at" IS 'Timestamp when the game server was last modified';

COMMENT ON COLUMN "public"."gameservers"."created_by" IS 'User ID who added this game server';

COMMENT ON COLUMN "public"."gameservers"."modified_by" IS 'User ID who last modified this game server';

COMMENT ON COLUMN "public"."gameservers"."addresses" IS 'Array of network addresses/hostnames for the game server';

COMMENT ON COLUMN "public"."gameservers"."administrator" IS 'User ID of the administrator responsible for this game server';

COMMENT ON COLUMN "public"."gameservers"."port" IS 'Network port the game server listens on';

COMMENT ON COLUMN "public"."gameservers"."game" IS 'Game ID this server is running';

COMMENT ON COLUMN "public"."gameservers"."description" IS 'Description of the game server and its purpose';

COMMENT ON COLUMN "public"."gameservers"."name" IS 'Display name for the game server';

COMMENT ON COLUMN "public"."gameservers"."region" IS 'Geographic region where the server is located';

COMMENT ON COLUMN "public"."gameservers"."container" IS 'Container name if this server runs in a container';

COMMENT ON COLUMN "public"."gameservers"."markdown" IS 'Detailed information about the server in Markdown format';

-- Add comments to Monthly Funding table
COMMENT ON TABLE "public"."monthly_funding" IS 'Monthly funding data tracking income and expenses for community transparency';

COMMENT ON COLUMN "public"."monthly_funding"."month" IS 'The month this funding data represents (first day of month)';

COMMENT ON COLUMN "public"."monthly_funding"."patreon_month_amount_cents" IS 'Patreon income for this month in cents';

COMMENT ON COLUMN "public"."monthly_funding"."patreon_lifetime_amount_cents" IS 'Total lifetime Patreon income in cents';

COMMENT ON COLUMN "public"."monthly_funding"."patreon_count" IS 'Number of active Patreon supporters this month';

COMMENT ON COLUMN "public"."monthly_funding"."donation_month_amount_cents" IS 'One-time donations received during this month in cents';

COMMENT ON COLUMN "public"."monthly_funding"."donation_lifetime_amount_cents" IS 'Total lifetime donations in cents';

COMMENT ON COLUMN "public"."monthly_funding"."donation_count" IS 'Number of donations received this month';

-- Add missing comments to Profiles table (excluding ban and last_seen fields which already have comments)
COMMENT ON COLUMN "public"."profiles"."id" IS 'User ID (matches auth.users.id)';

COMMENT ON COLUMN "public"."profiles"."created_at" IS 'Timestamp when the profile was created';

COMMENT ON COLUMN "public"."profiles"."modified_at" IS 'Timestamp when the profile was last modified';

COMMENT ON COLUMN "public"."profiles"."modified_by" IS 'User ID who last modified this profile';

COMMENT ON COLUMN "public"."profiles"."username" IS 'Unique username for the user';

COMMENT ON COLUMN "public"."profiles"."username_set" IS 'Whether the user has set their username (false for default generated usernames)';

COMMENT ON COLUMN "public"."profiles"."introduction" IS 'Brief introduction or about section for the user';

COMMENT ON COLUMN "public"."profiles"."markdown" IS 'User profile description/bio in Markdown format';

COMMENT ON COLUMN "public"."profiles"."patreon_id" IS 'Patreon user ID for linking accounts';

COMMENT ON COLUMN "public"."profiles"."discord_id" IS 'Discord user ID for linking accounts';

COMMENT ON COLUMN "public"."profiles"."steam_id" IS 'Steam ID for linking Steam accounts';

COMMENT ON COLUMN "public"."profiles"."supporter_patreon" IS 'Whether the user is currently a Patreon supporter';

COMMENT ON COLUMN "public"."profiles"."supporter_lifetime" IS 'Whether the user has lifetime supporter status';

COMMENT ON COLUMN "public"."profiles"."banned" IS 'Whether the user is currently banned';

COMMENT ON COLUMN "public"."profiles"."ban_start" IS 'Timestamp when the ban started';

COMMENT ON COLUMN "public"."profiles"."ban_end" IS 'Timestamp when the ban ends (null for permanent bans)';

COMMENT ON COLUMN "public"."profiles"."ban_reason" IS 'Reason for the ban';

-- Add comments to Referendum Votes table
COMMENT ON TABLE "public"."referendum_votes" IS 'Community referendum votes cast by users';

COMMENT ON COLUMN "public"."referendum_votes"."id" IS 'Unique identifier for the vote';

COMMENT ON COLUMN "public"."referendum_votes"."user_id" IS 'User ID who cast this vote';

COMMENT ON COLUMN "public"."referendum_votes"."created_at" IS 'Timestamp when the vote was cast';

COMMENT ON COLUMN "public"."referendum_votes"."modified_at" IS 'Timestamp when the vote was last modified';

COMMENT ON COLUMN "public"."referendum_votes"."referendum_id" IS 'Referendum ID this vote belongs to';

COMMENT ON COLUMN "public"."referendum_votes"."comment" IS 'Optional comment or explanation for the vote';

COMMENT ON COLUMN "public"."referendum_votes"."choices" IS 'Array of choice indices selected by the voter (supports multiple choice)';

-- Add comments to Referendums table
COMMENT ON TABLE "public"."referendums" IS 'Community referendums for democratic decision making';

COMMENT ON COLUMN "public"."referendums"."id" IS 'Unique identifier for the referendum';

COMMENT ON COLUMN "public"."referendums"."created_at" IS 'Timestamp when the referendum was created';

COMMENT ON COLUMN "public"."referendums"."created_by" IS 'User ID who created this referendum';

COMMENT ON COLUMN "public"."referendums"."modified_at" IS 'Timestamp when the referendum was last modified';

COMMENT ON COLUMN "public"."referendums"."modified_by" IS 'User ID who last modified this referendum';

COMMENT ON COLUMN "public"."referendums"."date_start" IS 'Timestamp when voting opens for this referendum';

COMMENT ON COLUMN "public"."referendums"."date_end" IS 'Timestamp when voting closes for this referendum';

COMMENT ON COLUMN "public"."referendums"."choices" IS 'Array of available choice options for voters';

COMMENT ON COLUMN "public"."referendums"."title" IS 'Title/headline of the referendum';

COMMENT ON COLUMN "public"."referendums"."description" IS 'Detailed description of what is being voted on';

COMMENT ON COLUMN "public"."referendums"."multiple_choice" IS 'Whether voters can select multiple options';

-- Add comments to Role Permissions table
COMMENT ON TABLE "public"."role_permissions" IS 'Mapping of permissions granted to each role in the RBAC system';

COMMENT ON COLUMN "public"."role_permissions"."id" IS 'Unique identifier for the role-permission mapping';

COMMENT ON COLUMN "public"."role_permissions"."role" IS 'Role that is granted this permission';

COMMENT ON COLUMN "public"."role_permissions"."permission" IS 'Specific permission being granted to the role';

-- Add comments to Servers table
COMMENT ON TABLE "public"."servers" IS 'Physical or virtual servers that host community infrastructure';

COMMENT ON COLUMN "public"."servers"."id" IS 'Unique identifier for the server';

COMMENT ON COLUMN "public"."servers"."created_at" IS 'Timestamp when the server was added to the system';

COMMENT ON COLUMN "public"."servers"."address" IS 'Network address or hostname of the server';

COMMENT ON COLUMN "public"."servers"."active" IS 'Whether this server is currently active and in use';

COMMENT ON COLUMN "public"."servers"."docker_control" IS 'Whether this server supports Docker container management';

COMMENT ON COLUMN "public"."servers"."docker_control_secure" IS 'Whether Docker control connections use secure protocols (HTTPS/TLS)';

COMMENT ON COLUMN "public"."servers"."docker_control_port" IS 'Port number for Docker control API connections';

COMMENT ON COLUMN "public"."servers"."docker_control_subdomain" IS 'Subdomain used for Docker control API access';

COMMENT ON COLUMN "public"."servers"."created_by" IS 'User ID who added this server to the system';

COMMENT ON COLUMN "public"."servers"."modified_at" IS 'Timestamp when the server record was last modified';

COMMENT ON COLUMN "public"."servers"."modified_by" IS 'User ID who last modified this server record';

-- Add comments to User Roles table
COMMENT ON TABLE "public"."user_roles" IS 'Assignment of roles to users in the RBAC system';

COMMENT ON COLUMN "public"."user_roles"."id" IS 'Unique identifier for the user-role assignment';

COMMENT ON COLUMN "public"."user_roles"."user_id" IS 'User ID who is assigned this role';

COMMENT ON COLUMN "public"."user_roles"."role" IS 'Role being assigned to the user';

