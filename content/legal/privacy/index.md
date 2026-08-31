---
title: Privacy Policy
date: 2026-09-01
revisions: [2025-05-01, 2026-03-14, 2026-05-14, 2026-09-01]
notes:
  - Named the GDPR data controller (Andrew Lake, operating Hivecom as a private individual) and committed to email notification and pre-transfer deletion requests if control of Hivecom ever changes hands.
  - Added a lawful bases section (3.1) mapping our processing to contract, consent, legitimate interests, and legal obligation under the GDPR.
  - Added a data retention section (5) with concrete periods, including 14 day deletion of connection logs, ban records kept for the life of the ban with indefinite bans reviewed at least yearly, and what happens to your data on account deletion.
  - Detailed IRC channel history and direct message storage, including that registered channel history is on by default and owner-controllable, direct messages are only stored if you opt in, and the other party's copy is governed by their own setting. Clarified TeamSpeak text chat is not stored on our side.
  - Narrowed the usage data sharing promise to name its only exceptions, legal obligation and user safety, instead of an unqualified never.
  - Corrected retention and access for statistics and presence data. The statistics history stores only counts; in-game name lists are dropped at capture and exist solely in the current snapshot behind the live server displays, overwritten every few minutes. Raw count snapshots are kept for 90 days before rolling up into daily aggregates kept indefinitely. Profile-linked presence is only ever the latest snapshot, visible to signed-in users, and deleted on unlink or account deletion. Previously the policy claimed indefinite retention of usernames and presence.
---

## 1. Introduction

Welcome to Hivecom. We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.

Hivecom is a community of friends hosting gameservers and building open source projects, operating on a non-profit basis where all donations are reinvested into server hosting costs or project funding.

**Our Core Privacy Principle**: Our goal is to know as little about you as possible and we are committed to maintaining this approach. We will never be sold to a larger entity that might change this philosophy. If control of Hivecom ever changes hands regardless, we will notify every account holder by email before the transfer takes effect, and anyone who asks us to delete their data first will have it deleted before anything moves.

**Who is responsible for your data**: Hivecom is not a registered legal entity. For the purposes of the GDPR, the data controller is Andrew Lake, operating Hivecom as a private individual, reachable at <contact@hivecom.net>.

## 2. Information We Collect

### 2.1 Account Information

When you create a user profile, we collect information such as:

- Username
- Email address
- Password (securely hashed)
- Optional profile information (avatar, biography, etc.)

### 2.2 Profile Visibility

Your profile includes information such as your username, avatar, biography, and any connected service activity (see Section 2.6). How much of this is visible depends on your settings:

- **Public profile (opt-in)**: By default, your profile is only visible to signed-in users. You can choose to make it public, which means anyone on the internet - including visitors who are not logged in - can view your full profile page.
- **Rich presence (opt-in)**: Activity data from connected services (such as what game you are playing) is not shown on your profile by default. You can choose to enable this from your account settings.

#### Forum Content

All forum posts and comments are publicly visible, including to visitors who are not signed in. However, the identities of users who post are anonymized for unauthenticated visitors - usernames are replaced with randomly generated pseudonyms (e.g., "BraveRedPanda") that remain consistent within a conversation so that discussions still read naturally.

If your profile is set to public, your real username and profile information are accessible alongside your posts to anyone. If your profile is not public, only signed-in users can see your real identity in forum threads.

It is worth noting that while anonymization provides a basic layer of protection against automated scraping by unauthenticated parties, it is not a security guarantee. A bad actor could create an account and access user information as any signed-in user would.

### 2.3 Game Server Data

We collect information about:

- In-game usernames
- Connection times
- Gameplay statistics
- Online status

### 2.4 Service Usage Information

We may collect certain information when you use our services, primarily as a side-effect of providing these services rather than through intentional gathering:

- IP addresses (e.g., when you connect to a game server, the server software naturally logs your connection)
- Browser type and user agent (automatically provided by your browser when accessing our website)
- Operating system
- Access times
- Pages viewed

We don't use this information for profit or any other gain, and we never share it with third parties for commercial purposes. No advertising, no analytics resale, no selling it on. The only exceptions are the narrow cases in Section 4: a valid legal obligation, or protecting the safety of our users or the public. Outside of those, this information is collected only to maintain and improve our services.

### 2.5 Communication Services

For our IRC and TeamSpeak services:

- We maintain minimal logs of connections for security and moderation purposes, including IP addresses, connection times, and disconnection times. These are deleted after 14 days
- IRC channels (#public, #lounge, #staff) are logged for moderation purposes, and we reserve the right to review these logs
- Our IRC server stores channel history so channels keep a readable archive of past conversation and you can catch up on what you missed while away. Registered channels are stored by default, and the channel owner can turn this off. Channels that are not registered are never written to disk
- Direct messages are not stored. If you want your own private conversations kept so you can replay them later, you can turn that on yourself from your IRC client, and it stays off for everyone who doesn't
- Because history follows each account, someone else in a conversation may have turned it on for themselves, in which case their copy stays in their history after you delete yours
- Message reactions, replies, and thread markers are stored alongside the messages they belong to
- TeamSpeak voice channels have minimal connection logs, deleted on the same 14 day cycle, and store no data at all about your voice conversations
- TeamSpeak text chat, whether in a channel or private, is not stored on our side. Anyone in the same channel can read what is posted there

### 2.6 Third-Party Service Integrations

You may choose to connect your account to external services. These connections are entirely optional and can be removed at any time from your account settings. When you connect a service, we collect and store the following:

- **Steam**: Your Steam ID, display name, online status, current and last played game, and profile visibility setting. This information is used to show your gaming activity on your profile.
- **Discord**: Your Discord ID and display name, along with your online status and current activity. This information is used to show your Discord presence on your profile.
- **TeamSpeak**: Your TeamSpeak identity, along with the server, channel, and online status when connected to a Hivecom TeamSpeak server. This information is used to show your TeamSpeak presence on your profile.
- **Patreon**: Your Patreon ID and supporter status. This information is used to recognize your support for the community.

Rich presence is disabled by default. If you choose to enable it, your activity from connected services becomes visible on your profile. You can toggle this at any time from your account settings.

Each of these services has its own privacy policy. By connecting your account, you also agree to how those services handle your data on their end - we have no control over that.

### 2.7 Community Projects and OAuth Data Access

Some community projects - whether operated by Hivecom directly or built by affiliated contributors and users - may request access to your Hivecom account data through an OAuth authorization flow. These are considered second-party integrations and are part of the broader Hivecom community ecosystem. Hivecom maintains responsibility for all OAuth clients, including those created on behalf of community-built projects.

When you authorize such a connection, you grant that sub-project access only to the specific data scopes you approve at the time of authorization. You can revoke this access at any time from your account settings.

Any community sub-project that accesses your data through this mechanism is bound by the same privacy protections described in this policy and may not:

- Use your data for purposes beyond what you authorized
- Share, sell, or distribute your Hivecom account data to external parties
- Apply weaker privacy protections than those described here

Hivecom reserves the right to revoke OAuth access from any sub-project that violates these requirements. See our [Terms of Service](/legal/terms) for the full obligations that apply to community projects.

### 2.8 Supporter and Funding Data

If you support Hivecom through Patreon or direct donations, we store your supporter status and aggregate contribution data. This is used to track community funding and recognize supporters. We do not store payment details directly - all payment processing is handled by the respective platform (e.g., Patreon, PayPal).

### 2.9 Community Statistics

We periodically collect aggregate, anonymous snapshots of community activity to power the public community statistics display and internal reporting. These counts contain no personal information and no individual user can be identified from them:

- **Online activity**: Total member count and count of currently online users, derived from the `last_seen` timestamp updated while you are signed in. Member counts broken down by country are also recorded, using the country you have optionally set on your profile.
- **Discussion and reply counts**: Total number of discussions and replies across the forum - purely numeric counts with no content or author information.
- **Game activity**: Count of how many users are currently playing each game, derived from Steam presence data. Only counted for users who have explicitly opted in to rich presence (see Section 2.6).
- **Communication, game and voice server counts**: Total player counts across Hivecom-operated game servers, IRC connections and TeamSpeak users.

Snapshots are collected every few minutes. After 90 days they are collapsed into one aggregate row per day, and those daily aggregates are what we keep long term.

### 2.10 Server Presence Snapshots

When querying communication and game servers for the above statistics, we capture a snapshot of who is currently connected. This includes in-game usernames and TeamSpeak display names as an example - the same information visible to any other player on the same server at the time. These servers are generally public, and their query protocols answer anyone who asks, so the same player lists can already be sampled by anyone on the internet whether or not we record them.

Where a connected player's identity can be matched to a linked Hivecom account - for example, a Steam ID associated with a connected Steam account, or a TeamSpeak unique identity matching a linked TeamSpeak identity - that presence is associated with the corresponding user profile. This association is what enables features like clicking a username in the TeamSpeak viewer to navigate to a user's profile. Profile-linked presence is only visible while signed in, and only for public profiles. We keep just the latest snapshot per service, each update overwrites the previous one, and it is deleted when you unlink the service or delete your account.

The snapshots kept in the statistics history of Section 2.9 contain only player counts; name lists are dropped at the moment of capture and never enter the stored history. The one stored name list is the current snapshot that powers the live server displays, a single point in time overwritten every few minutes, which shows nothing more than querying the server directly would.

This data is used solely to power live server displays within Hivecom. No chat, voice, or private connection details are recorded.

### 2.11 Cookies and Tracking Technologies

Cookies are small data files stored on your device that help us recognize you and remember your preferences. You can control cookie settings through your browser, but disabling cookies may affect your ability to use certain features of our services.

We exclusively use our site's cookies for the following purposes:

- Session management: To maintain your session while you are logged in
- Preferences: To remember your preferences and settings

We do not use our cookies for advertising purposes and never will.

Keep in mind that third-party integrations such as authentication providers (e.g., Google, Discord) may use their own cookies and tracking technologies. We do not control these third-party services and are not responsible for their privacy practices.

## 3. How We Use Your Information

We use the information we collect to:

- Provide, maintain, and improve our services
- Create and manage your account
- Process and display game server information
- Display activity and presence data on your profile (when enabled)
- Facilitate community voting and referendum processes
- Ensure the security of our services
- Communicate with you about updates or changes to our services

### 3.1 Lawful Bases Under the GDPR

Where the GDPR applies, these are the grounds we rely on:

- **Performance of a contract**: your account data (username, email, hashed password) and the profile features you use. We cannot give you an account without it.
- **Consent**: everything optional. Third-party connections (Steam, Discord, TeamSpeak, Patreon), rich presence, public profile visibility, the country shown on your profile, and storage of your IRC direct messages. You can withdraw consent for any of these from your account settings or your IRC client, which stops that processing going forward.
- **Legitimate interests**: connection logs, IP addresses, channel moderation logs, and ban records, so we can keep the servers running and enforce our rules. Also IRC channel history, which serves as the shared archive of a registered channel so past conversation stays readable; the channel owner can turn it off and you can delete your own messages at any time. And the aggregate community statistics in Section 2.9, which contain no personal information. In each case we weigh this against your privacy and keep only what the purpose needs.
- **Legal obligation**: the narrow cases in Section 4 where we are required to respond to a lawful request.

## 4. Information Sharing and Disclosure

We do not sell or rent your personal information to third parties. We may share information in the following circumstances:

- With your consent
- To comply with legal obligations
- To protect the rights, property, or safety of our users or the public

If you are based in the European Economic Area, or your data is processed through our German-hosted infrastructure, we handle it in compliance with the GDPR.

## 5. Data Retention

How long we keep things depends on what it is:

- **Account and profile data**: for as long as your account exists. Delete the account and this goes with it.
- **Forum posts and comments**: for as long as the discussion exists, since pulling posts out retroactively breaks conversations other people took part in. You can ask us to remove your own posts.
- **Game server data**: aggregate server history, meaning player counts over time, is kept indefinitely so community statistics stay intact over the years. In-game usernames never enter that history; the only stored name list is the current live display snapshot, overwritten every few minutes. The profile-linked presence in Section 2.10 is only ever the latest snapshot and is deleted with your account or the unlinked service.
- **Connection logs containing IP addresses**: 14 days, across game servers, IRC, and TeamSpeak alike, after which they are rotated out and deleted.
- **Ban records**: for as long as the ban is in force. Where a ban has no end date, the record is kept just as long, and we review indefinite bans at least once a year to confirm each one is still needed. This is the one place we deliberately keep an identity and last known address beyond the 14 day window, because a ban that cannot be enforced is not a ban.
- **IRC channel history**: stored with no expiry date for registered channels that have it enabled. You can delete your own messages at any time.
- **IRC direct messages**: not stored unless you turn history on for yourself, in which case your copy has no expiry date and you can delete it whenever you like. If the person you were talking to turned it on for themselves, their copy is theirs.
- **Community statistics**: raw snapshots for 90 days, daily aggregates indefinitely. Both are counts with no personal information in them.

If you delete your account, the data tied to it is removed with it. Aggregate statistics remain, since nothing in them points back to you. For forum posts, tell us what you would like done with them and we will handle it as part of the deletion. The same goes for IRC channel history: messages you posted in shared channels stay part of those conversations, so delete them yourself before closing the account or tell us and we will remove them for you.

## 6. Data Security

We implement appropriate security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, no internet transmission is completely secure, and we cannot guarantee the security of your information.

## 7. Your Rights

Depending on your location, including rights granted under the GDPR, you may have the right to:

- Access the personal information we hold about you
- Correct inaccurate or incomplete information
- Delete your personal information
- Restrict or object to certain processing activities
- Withdraw consent where applicable

To exercise these rights, please contact us at <contact@hivecom.net>.

## 8. Children's Privacy

Our services are not intended for individuals under the age of 13, or the applicable age of digital consent in your jurisdiction if higher (for example, 16 in many EU member states under GDPR). We do not knowingly collect personal information from children under the applicable minimum age.

## 9. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. If we make material changes, we will notify you directly by sending an email to the address associated with your user account before the changes take effect. The most current version will always be posted on this page with the effective date.

## 10. Contact Information

If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:

- Email: <contact@hivecom.net>
- Primary Contact: Andrew Lake ([@zealsprince](https://zealsprince.com)), Primary Owner and Operator of Hivecom
- Data Controller for GDPR purposes: Andrew Lake, operating Hivecom as a private individual
