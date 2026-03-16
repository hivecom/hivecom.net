This ticket is a vast catalogue of repeating issues and improvement points that we've identified through automated agentic means. Each issue here is closely related to another but can be solved in a vacuum. Though they don't solve functionality or improve the application for users (except possibly caching more data), they help with the long-term maintainability of the application.

## CSS / Layout Cleanup Candidates

| # | File | Issue | Priority |
|---|------|--------|----------|
| 1 | `pages/community/index.vue` | **31 layout CSS rules** - large number of `display:flex`, `flex-direction`, `gap`, `align-items`, `justify-content` blocks that can be replaced with `<Flex>` / `<Grid>` VUI primitives | High |
| 2 | `components/Layout/Navigation.vue` | **24 layout CSS rules** - flex layouts throughout nav items, dropdowns, and link wrappers are expressible with `<Flex>` props | High |
| 3 | `components/GameServers/GameServerLibrary.vue` | **22 layout CSS rules** - layout-only CSS throughout; good candidate for `<Flex column>` / `<Grid>` replacement | High |
| 4 | `components/Discussions/models/DiscussionModelForum.vue` | **23 layout CSS rules** - duplicate `gap` declarations on same selector (lines 459-460), mixed `flex-direction: column-reverse`, layout CSS that can become VUI props | High |
| 5 | `components/Events/EventsCalendar.vue` | **27 `!important` rules** + 16 layout rules - heavy reliance on `!important` to override VUI internals; needs `:deep()` scoping + Flex props review | High |
| 6 | `components/Events/Event.vue` | **39 `!important` rules** - most are overriding VUI Flex/Card children (mobile responsive overrides); investigate replacing with `:deep()` or responsive VUI props | High |
| 7 | `components/Editor/RichTextSelectionMenu.vue` | **889 lines, 15 layout CSS rules, 2 `!important`, 10 inline `style=`** - the selection/bubble menu is nearly as complex as `RichTextEditor.vue` itself. Extract `EditorColorPicker`, `EditorFontSelector`, `EditorSizeSelector` sub-panels; `style=` bindings (dynamic color/font values) may be unavoidable but should be typed | High |
| 8 | `components/Events/EventsListing.vue` | **16 `!important` rules** + layout CSS - same pattern as `Event.vue` / `EventsCalendar.vue` | Medium |
| 9 | `components/Admin/Funding/IncomeChart.vue` | **~14 layout CSS rules** - legend/header wrappers are pure flex and map 1:1 to `<Flex y-center gap="s">` etc. | Medium |
| 10 | `components/Admin/Funding/UserChart.vue` | **~14 layout CSS rules** - nearly identical to `IncomeChart.vue`; same legend/header flex pattern | Medium |
| 11 | `components/Community/ProjectCard.vue` | **15+ layout CSS rules** - card body, tag row, footer row are all pure flex | Medium |
| 12 | `components/GameServers/GameServerHeader.vue` | **22 layout CSS rules** + 3 `!important` - action/metadata column wrappers are pure flex column; contains `!important` overrides | Medium |
| 13 | `components/Shared/GameDetailsModal.vue` | **14 layout CSS rules** - modal body sections are nested `flex-direction: column` with gap, directly replaceable | Medium |
| 14 | `components/Shared/UserPreviewCard.vue` | Layout CSS (`flex-direction: column`, `gap`) - the top-level wrapper and content column are pure `<Flex column gap="m">` | Medium |
| 15 | `components/Shared/ReferendumResults.vue` | Layout CSS + 2 `!important` - result rows and container are `flex-direction: column` with gap | Medium |
| 16 | `components/Shared/SupportModal.vue` | Layout CSS - modal content sections are `flex column gap-m/xs`; paypal/tier blocks are `flex justify-center gap-l` | Medium |
| 17 | `components/Settings/ConnectionsCard.vue` | Layout CSS + **5 inline `style=`** - connection rows, action wrappers convertible to `<Flex y-end column>` | Medium |
| 18 | `components/Discussions/models/DiscussionModelComment.vue` | **10 layout CSS rules, 5 `!important`** - sibling of `DiscussionModelForum.vue` (#4) with the same pattern of layout CSS and `!important` overrides; should be treated as a paired cleanup | Medium |
| 19 | `components/Settings/ProfileSummaryCard.vue` | Layout CSS - content and info sections are `flex column gap-l/xxs` | Low |
| 20 | `components/Profile/RichPresenceSteam.vue` | **14 layout CSS rules** - all four sections are simple `flex column` / `flex row x-between y-center` | Low |
| 21 | `components/Profile/ProfileForm.vue` | Layout CSS - footer buttons (`justify-content: flex-end`), avatar row, badge row | Low |
| 22 | `components/Shared/MetadataCard.vue` | Layout CSS - icon+text rows are `<Flex y-center gap="s">` | Low |
| 23 | `components/Shared/MarkdownPreview.vue` | Layout CSS - preview row is `flex y-center gap-xxs` | Low |
| 24 | `components/Admin/Complaints/ComplaintCard.vue` | Layout CSS - card body is `flex column` | Low |
| 25 | `components/Admin/Users/UserTable.vue` | Layout CSS - username/status column stacks are `flex column gap-2px` | Low |
| 26 | `components/Reactions/ReactionsSelect.vue` | Layout CSS - emote-group and emote-row wrappers are pure `flex column gap-xs` | Low |
| 27 | `components/Admin/Referendums/ReferendumForm.vue` | Layout CSS - option rows/add button row are `flex y-center gap-xs` | Low |
| 28 | `components/Admin/Projects/ProjectForm.vue` | Layout CSS - preview section, image action row | Low |
| 29 | `pages/votes/[id].vue` | Layout CSS - options list, choice row, and status block are pure flex column/row | Low |
| 30 | `components/Layout/UserDropdown.vue` | **Duplicated CSS** - `.user-dropdown__header` and `.user-dropdown__user` blocks are identical `flex x-between y-center gap-8px`; extract to one class or use `<Flex>` | Low |
| 31 | `components/Shared/BulkAvatarDisplay.vue` | Layout CSS + 4 inline `style=` - avatar stack cell wrappers are `flex y-center x-center` | Low |
| 32 | `components/Shared/BulkAvatarDisplayCluster.vue` | Layout CSS + 4 inline `style=` - same as `BulkAvatarDisplay` | Low |
| 33 | `components/Landing/LandingHero.vue` | Layout CSS - hero content column and action wrapper are `flex column gap` | Low |
| 34 | `components/Settings/ConnectTeamSpeak.vue` | Layout CSS - form action row is `flex column align-end` | Low |
| 35 | `components/Profile/Badges/ProfileBadge.vue` | Layout CSS - main badge container and icon cells | Low |
| 36 | `pages/forum/index.vue` | Layout CSS - sidebar and update feed rows | Low |
| 37 | `pages/index.vue` | Layout CSS - landing sections | Low |
| 38 | `components/Events/EventCardLanding.vue` | Layout CSS + 3 `!important` | Low |
| 39 | `components/Community/FundingProgress.vue` | 40 `!important` | Low |
| 40 | `components/Profile/ProfileHeader.vue` | 42 `!important` + 4 inline `style=` | Low |
| 41 | `components/Admin/Discussions/DiscussionDetails.vue` | Layout CSS - detail header wrapper | Low |
| 42 | `components/Admin/Complaints/ComplaintDetails.vue` | Layout CSS - detail sections | Low |
| 43 | `pages/community/projects/[id].vue` | **12 layout CSS rules** - project detail page with banner, metadata, and description sections; all `flex column` / `flex row` wrappers | Low |
| 44 | `pages/community/badges.vue` | **6 layout CSS rules** - badge gallery page | Low |
| 45 | `components/Layout/Footer.vue` | **2 `!important`** - both are responsive overrides for `flex-direction` and `align-items`; replaceable with responsive VUI `<Flex>` props or `<Grid>` | Low |
| 46 | `components/Events/EventTiming.vue` | **2 `!important`** - used to force `grid-template-columns` at breakpoints; needs `:deep()` or responsive grid props | Low |
| 47 | `components/Events/CountdownTimer.vue` | **2 `!important`**, `display: flex` - same pattern as `EventTiming.vue` | Low |
| 48 | `components/Admin/KPIContainer.vue` | **2 `!important`** on `flex-wrap` - tiny 38-line component; the overrides could be replaced with a `<Flex wrap>` prop | Low |
| 49 | `components/Notifications/NotificationCard.vue` lines 156-158 | **Duplicate `min-width` declarations on the same selector** - `&__main` first sets `min-width: 256px !important` then immediately overrides it with `min-width: 0`. The `!important` line is dead; the effective value is `min-width: 0`. Delete the first declaration. | Low |
| 50 | `pages/profile/settings.vue` | **Unscoped `<style>` block piercing a child component** - the file has two style blocks: a bare `<style>` (no `scoped`) declaring `.settings-callout__icon` and a `<style lang="scss" scoped>` for everything else. The `.settings-callout__icon` class is actually defined *and scoped* inside `components/Settings/ChangePasswordCard.vue`; the parent's global override works only by accident. Merge into the scoped block using `:deep(.settings-callout__icon)` or remove the redundant rule. | Medium |
| 51 | `components/Profile/RichPresenceSteam.vue`, `components/Profile/RichPresenceTeamSpeak.vue`, `components/Profile/ProfileHeader.vue` | **Three components with unscoped `<style>` blocks** - each file contains a bare `<style>` block alongside its `<style scoped>` block, leaking `.steam-presence`, `.ts-presence`, `.ts-presence__badge`, `.profile__online-indicator`, etc. into the global stylesheet. All selectors are component-specific and safe to move into the existing scoped blocks (the SCSS nesting for `.profile__online-indicator` requires `&.active` which works fine scoped). | Medium |


---

## Helper `.ts` File Issues (Naming, Decomposition, Duplication)

| # | File(s) | Issue | Priority |
|---|---------|--------|----------|
| ~~52~~ | ~~`lib/discussionBadge.ts` + `lib/partyAnimalBadge.ts` + `components/Profile/Badges/ProfileBadge.vue` + `ProfileBadgeYears.vue` + `Profile/ProfileBadges.vue` + `Shared/UserPreviewCardBadges.vue`~~ | ~~**`BadgeVariant` type re-declared in 6 places**~~ - **DONE**: consolidated into `lib/badges.ts`; all 6 consumers import from there; old files are re-export shims. | ~~High~~ |
| ~~53~~ | ~~`lib/partyAnimalBadge.ts`~~ | ~~**Inconsistent constant name**: `PARTY_ANIMAL_BADGETHRESHOLDS`~~ - **DONE**: renamed to `PARTY_ANIMAL_BADGE_THRESHOLDS` in `lib/badges.ts`; legacy alias kept in shim. | ~~High~~ |
| ~~54~~ | ~~`lib/discussionBadge.ts` + `lib/partyAnimalBadge.ts`~~ | ~~**Could be merged**~~ - **DONE**: merged into `lib/badges.ts`; both old files are now thin re-export shims. | ~~High~~ |
| ~~55~~ | ~~`composables/useCacheBadgeDiscussionReplyCount.ts` `composables/useCacheBadgeDiscussionStartedCount.ts` `composables/useCacheBadgePartyAnimalCount.ts`~~ | ~~**383 lines of nearly identical boilerplate**~~ - **DONE**: generic `useCacheBadgeCount(userId, config)` factory created in `composables/useCacheBadgeCount.ts`; all three composables are now thin wrappers (~20 lines each) supplying only their `fetchCount` callback and `cacheKeyPrefix`. Return shape standardised to `{ count, loading, error, refresh, invalidate }` across all three (fixes #152 inconsistency at the same time). | ~~High~~ |
| ~~56~~ | ~~`lib/cmsAssets.ts`~~ | ~~**Entirely dead - zero callers**~~ - **DONE**: file deleted. | ~~High~~ |
| ~~57~~ | ~~`lib/user.ts`~~ | ~~**`useCurrentUserId` is dead code**~~ - **DONE**: `lib/user.ts` deleted entirely; `extractSupabaseUserId` inlined into `composables/useUserId.ts` (see #67). | ~~Medium~~ |
| ~~58~~ | ~~`lib/user.ts` line 22~~ | ~~**`as never` cast** (`const id = user.id as never`)~~ - **DONE**: removed with the deletion of `lib/user.ts`; `useUserId.ts` now uses safe `(user.value as Record<string, unknown>).id` with a `typeof` guard. | ~~Medium~~ |
| ~~59~~ | ~~`components/Admin/KVStore/KVStoreTable.vue` lines 2 & 9~~ | ~~**Two relative `'../../../lib/kvstore'` imports**~~ - **DONE**: both imports updated to `@/lib/kvstore`. | ~~Medium~~ |
| ~~60~~ | ~~`lib/anonymous-usernames.ts` + `lib/markdown-processors.ts`~~ | ~~**Kebab-case filenames**~~ - **DONE**: both files renamed to `lib/anonymousUsernames.ts` and `lib/markdownProcessors.ts`; all 11 import sites updated (3 callers of `anonymous-usernames`, 8 callers of `markdown-processors` including the internal self-import in `markdownProcessors.ts`). | ~~Medium~~ |
| ~~61~~ | ~~`lib/utils/random.ts`~~ | ~~**Missing `shuffleArray` export**~~ - **DONE**: `shuffleArray<T>(arr: T[]): T[]` added to `lib/utils/random.ts`; all four callers updated (`BulkAvatarDisplay.vue`, `BulkAvatarDisplayCluster.vue`, `LandingMotd.vue`, `pages/community/index.vue` - biased sort anti-pattern replaced). | ~~Medium~~ |
| ~~62~~ | ~~`lib/anonymousUsernames.ts` line 1~~ | ~~**Relative path import** for the JSON file (`../../usernames.json`) - the only relative-path import in any `lib/` file.~~ - **DONE**: `usernames.json` copied to `app/assets/usernames.json`; import updated to `@/assets/usernames.json`. | ~~Low~~ |
| ~~63~~ | ~~`composables/useTableActions.ts`~~ | ~~**Misleading name** - the composable only determines *permissions* for table actions, not the actions themselves. `useTablePermissions` would be more accurate. Also: the `catch` block silently swallows *all* errors, not just "not in admin context" ones - should check the error type before swallowing~~ - **DONE**: catch block tightened to re-throw any error that does not mention `'admin'` or `'inject'`; name kept as-is since renaming would require updating all 12+ call sites for minimal gain. | ~~Medium~~ |
| ~~64~~ | ~~`composables/useCacheAvatar.ts`~~ | ~~**Orphaned composable**~~ - **DONE**: confirmed zero callers; file deleted. | ~~Medium~~ |
| ~~65~~ | ~~`components/Profile/Activity/shared.ts`~~ | ~~**Unused** - `ActivityComponentProps` is defined but never imported~~ - **DONE**: confirmed zero callers; file deleted. | ~~Medium~~ |
| ~~66~~ | ~~`lib/placeholderBannerProjects.ts`~~ | ~~**Naming**: verbose and inverted - describes what it does (`placeholder banner`) and the subject (`Projects`), but the convention for lib files is noun-first. Consider `projectBannerPlaceholder.ts` or `projectBanners.ts`~~ - **DONE**: file renamed to `lib/projectBannerPlaceholders.ts`; all import sites updated. | ~~Low~~ |
| ~~67~~ | ~~`lib/user.ts`~~ | ~~**Scope too narrow**~~ - **DONE**: `lib/user.ts` deleted; `extractSupabaseUserId` logic inlined directly into `composables/useUserId.ts`, eliminating the indirection layer. Dead `useCurrentUserId` removed at the same time (#57). | ~~Low~~ |
| 68 | `lib/navigation.ts` | **Single export, no logic** - the file is just a plain data array with no functions; could reasonably live in `app.config.ts` or a `config/navigation.ts` to signal it's configuration not a library | Low |
| 69 | `composables/useCanonicalUrl.ts` | **Single caller** (`app.vue`) - worth considering whether this thin wrapper should live inline in `app.vue` rather than as a standalone composable | Low |

---

## Import Hygiene: `database.types` vs `database.overrides`

| # | File(s) | Issue | Priority |
|---|---------|--------|----------|
| ~~70~~ | ~~**~30+ component files**~~ | ~~**`Tables`, `TablesInsert`, `TablesUpdate` imported from `@/types/database.types`** instead of `@/types/database.overrides` as required by project guidelines.~~ - **DONE**: bulk codemod replaced all 84 violating files that imported `Tables`/`TablesInsert`/`TablesUpdate` without also needing `Database`; the 4 files that imported both were split into two import lines manually. | ~~High~~ |
| ~~71~~ | ~~`pages/community/funding.vue` + `components/Community/FundingProgress.vue` + `components/Community/SupportCTA.vue`~~ | ~~**Redundant parallel fetches of `monthly_funding`**~~ - **DONE**: `useMonthlyFunding()` composable created in `composables/useMonthlyFunding.ts` (TTL 30 min); `FundingProgress` and `SupportCTA` now derive from it; 7 total call sites consolidated. See also #158/#159/#175. | ~~High~~ |

---

## Dead Code / Orphaned Files

| # | File | Issue | Priority |
|---|------|--------|----------|
| ~~72~~ | ~~`components/Community/DonationBar..vue`~~ | ~~**Typo in filename** (double dot) + **hardcoded stub**~~ - **DONE**: confirmed zero callers; file deleted. | ~~High (bug)~~ |
| ~~73~~ | ~~`components/Community/ProjectMetadata.vue`~~ | ~~**Zero callers**~~ - **DONE**: confirmed zero callers; file deleted. | ~~Medium~~ |
| ~~74~~ | ~~`components/Profile/Activity/ActivitySpotify.vue`~~ | ~~**Permanently commented out** - the only reference in `ProfileActivity.vue` is `<!-- <ActivitySpotify /> -->`. The component file (28 lines) exists but is never rendered.~~ - **DONE**: confirmed zero active callers (only a commented-out reference); file deleted. | ~~Low~~ |
| 75 | `components/Shared/ErrorToast.vue` | **2 `!important`** overriding VUI toast text/font styles - small (44 lines) but the overrides suggest the VUI toast token isn't being used correctly; worth a quick audit | Low |
| 76 | `components/Admin/Funding/ExpenseForm.vue` | **2 `!important`** on `border-color` for validation state - could use a VUI form validation approach with `:deep()` instead | Low |
| ~~199~~ | ~~`components/Admin/Events/EventTable.vue` - dead `canManage` prop~~ | ~~`defineProps<{ canManage?: boolean }>()` was assigned to `_props` and never referenced in the template. `useAdminCrudTable` already provides `canManageResource` and `canCreate` internally. The prop was passed from `pages/admin/events.vue` via `:can-manage="canManageEvents"`, which also drove a now-removed `canManageEvents` computed.~~ - **DONE**: prop removed from `EventTable.vue`; `:can-manage` binding and `canManageEvents` computed removed from `pages/admin/events.vue`. | ~~High (dead code)~~ |
| ~~200~~ | ~~`pages/admin/index.vue` - permanently-zero `refreshSignal` passed to four dashboard components~~ | ~~`refreshSignal` was declared as `ref(0)` and passed as `:refresh-signal` to `KPIOverview`, `IncomeChart`, `UserChart`, and `Alerts`. It was never incremented anywhere on the page. All four components had `watch(() => props.refreshSignal, () => { if (props.refreshSignal) { ... } })` - since the value was always `0` (falsy), these watchers never fired. Entirely dead.~~ - **DONE**: `refreshSignal` ref removed from `pages/admin/index.vue`; all four `:refresh-signal` bindings removed; `refreshSignal` prop + watcher removed from `KPIOverview.vue`, `IncomeChart.vue`, `UserChart.vue`, and `Alerts.vue`; unused `watch`/`ref` imports cleaned up in each. `IncomeChart` also had a now-unreachable `refreshFunding()` call that was removed. | ~~High (dead code)~~ |

---

## Large Components Needing Decomposition (DRY / SRP Violations)

| # | File | Size | Issue | Priority |
|---|------|------|--------|----------|
| 77 | `pages/forum/index.vue` | **1624 lines, 27 template blocks** | Monolithic forum page: contains full topic tree logic, activity feed, recently-visited tracking, search command palette, drafts, settings persistence, and URL routing all in one file. Extract: `ForumActivityFeed`, `ForumRecentlyVisited`, `ForumTopicTree` (or reuse `ForumTopicItem` more), and move the search commands to a composable | High |
| 78 | `components/Admin/Users/UserForm.vue` | **1300 lines** | Admin user form handles avatar upload, badge editing, role assignment, permission verification, field validation (8+ computed validators), birthday picker adapter, and delete confirmation all in one component. Extract: `UserFormBadgeEditor`, `UserFormRoleSelector`, `UserFormAvatarSection`, and move validators to a composable | High |
| 79 | `components/Editor/RichTextSelectionMenu.vue` | **889 lines** | Handles color picker, font picker, size picker, link editing, table insertion, math/YouTube modal triggers, and a plain-text markdown toolbar - all in one component. Extract `EditorColorPanel`, `EditorFontPanel`, `EditorFormatMenu` | High |
| 80 | `components/Discussions/Discussion.vue` | **835 lines, 17 template blocks** | Threaded discussion viewer containing view-mode toggle (flat/threaded), vote/reaction logic, thread tree building, off-topic filtering, and inline toolbar. Extract `DiscussionThreadedView` and `DiscussionFlatView`, move tree-building logic to a composable `useDiscussionThread` | High |
| 81 | `components/Admin/Users/UserTable.vue` | **1058 lines** | User table with inline user-status indicator, ban badge rendering, activity status, bulk search, sort, and filter all embedded. Extract `UserTableRow`, move sort/filter state to `useUserTableFilters` composable | High |
| 82 | `components/Profile/ProfileDetail.vue` | **976 lines, 10 template blocks** | Profile page aggregates: friendship state machine (5 states), friends list, own/other-profile mode switching, avatar update, complaint modal, edit sheet, and friend request flow. Extract `ProfileFriendActions`, `ProfileEditSheet`, move friendship logic to `useFriendship` composable | High |
| 83 | `pages/forum/[id].vue` | **832 lines, 19 `v-if` branches** | Individual discussion thread page - contains: locked/deleted/banned guard states, breadcrumb logic, discussion viewer embed, RSVP, reactions, mod action bar, complaint manager, delete confirm modal. Extract `ForumTopicHeader`, `ForumTopicModActions`, move guard logic to `useForumTopicGuards` composable | High |
| 84 | `components/Landing/LandingHeroGlobe.vue` | **743 lines** | A single `<script setup>` containing: GLSL shader source strings, a full WebGL post-processing pipeline (`setupScanlinePass`, bloom, afterimage), globe data loading and country centroid computation, arc/ring spawn scheduling, per-frame tick animation, theme detection, and a resize observer. Extract `useGlobeRenderer` composable (animation loop, timer management), `useGlobeTheme` (color helpers, theme detection), `GlobeShaders.ts` (GLSL constants), and `useGlobeData` (metrics fetch, centroid mapping) | High |
| 85 | `layouts/admin.vue` | **550 lines** | Conflates authorization/guard logic (fetching role + permissions, redirect on failure), desktop sidebar nav, mobile sheet nav with mini-mode, provide/inject of permissions context, and layout preference persistence. Extract `useAdminAuth` composable (the `onMounted` role check + `watch(user)` redirect), `AdminSidebarNav` component, and `AdminMobileBar` component | High |
| 86 | `components/Layout/NotificationDropdown.vue` | **488 lines** | Fetches friend requests, birthday, pending complaints count, and three categories of DB notifications all in one `fetchNotifications()` function, then maps them into 9 different card components with per-type computed properties. Extract `useNotifications` composable (all data fetching, computed counts, friend-action handlers, mark-as-read), leaving the dropdown as a thin rendering shell | High |
| 87 | `components/Admin/Users/UserDetails.vue` | **777 lines** | Detail panel for a user with ban status, activity log, friendship list, profile summary, and inline ban form. Extract `UserDetailsBanPanel`, `UserDetailsProfileSummary` | Medium |
| 88 | `components/Admin/Discussions/DiscussionDetails.vue` | **719 lines** | Discussion detail panel with file attachments section, author info, moderation actions, and reply listing. Extract `DiscussionAttachments`, move moderation actions to `DiscussionModerationPanel` | Medium |
| 89 | `components/Admin/Network/ContainerTable.vue` | **719 lines** | Container management table with inline status badges, log viewer embed, action bar, and filter state. Extract `ContainerTableRow`, `ContainerStatusBadge` | Medium |
| 90 | `components/Admin/Complaints/ComplaintDetails.vue` | **583 lines** | Complaint detail panel mixing complaint metadata, thread display, and status management. Extract `ComplaintThreadPanel` | Medium |
| 91 | `components/Admin/Complaints/ComplaintList.vue` | **578 lines** | Large list with inline sort, filter, pagination, and card rendering. Extract `ComplaintListFilters` composable, use `ComplaintCard` more aggressively | Medium |
| 92 | `components/Admin/Assets/AssetManager.vue` | **840 lines, 14 template blocks** | Asset browser combining directory listing, breadcrumb navigation, upload trigger, rename/delete modals, image preview, and multi-bucket support. Extract `AssetBreadcrumbs`, `AssetGrid`, `AssetPreview` | Medium |
| 93 | `components/Editor/RichTextEditor.vue` | **991 lines** | Editor toolbar, image upload, mention picker, math modal, YouTube modal, formatting menus, and font/size/color extension wiring all in one file. Extract `EditorToolbarRow`, `EditorAttachmentUpload`; plugins are already split into `plugins/` but the parent is still too large | Medium |
| 94 | `components/Settings/MfaCard.vue` | **791 lines** | MFA management with TOTP setup wizard (QR + secret + naming), factor list management, remove-factor confirmation, and elevated-role guard. Extract `MfaTotpSetup`, `MfaFactorList` | Medium |
| 95 | `components/Settings/ConnectTeamSpeak.vue` | **658 lines** | TeamSpeak connection wizard with 4-step flow (manage/request/confirm/success), identity list, server selector, and error handling. Extract `TeamspeakConnectionWizard`, `TeamspeakIdentityList` | Medium |
| 96 | `components/Profile/ProfileForm.vue` | **774 lines** | Profile edit form with avatar, badge selection, country picker, birthday picker, Markdown editor, link fields, and submit. Extract `ProfileFormBadgeSelect`, `ProfileFormAvatarSection` | Medium |
| 97 | `components/Events/EventsCalendar.vue` | **854 lines, 7 template blocks** | Full calendar + event detail sidebar, filtering, RSVP, countdown, and VUI `!important` overrides. Extract `EventCalendarSidebar`, `EventCalendarDayCell` | Medium |
| 98 | `components/Admin/Discussions/DiscussionTable.vue` | **614 lines** | Discussion admin table with inline topic/author display, status filters, bulk actions. Extract `DiscussionTableFilters` composable | Medium |
| 99 | `pages/auth/sign-in.vue` | **655 lines** | Sign-in page handling email/password form, MFA TOTP step, MFA list-factor step, and OAuth buttons across 11 `v-if` branches. Extract `SignInMfaStep`, `SignInOAuthButtons` | Medium |
| 100 | `components/Discussions/models/DiscussionModelComment.vue` | **493 lines** | Paired with `DiscussionModelForum.vue` (#4) but absent from original ticket. Contains vote/reaction logic, 10 flex rules, 5 `!important` overrides | Medium |
| 101 | `components/Settings/ConnectionsCard.vue` | **565 lines** | One card managing five distinct connection providers (Patreon, Steam, Discord, TeamSpeak, rich-presence toggle), each with its own disconnect handler, loading state, and inline conditional layout. Each provider is its own SRP unit - extract `ConnectionRowPatreon`, `ConnectionRowSteam`, `ConnectionRowDiscord`, `ConnectionRowTeamSpeak`, `ConnectionRowRichPresence`, all sharing a generic `ConnectionRow` wrapper slot pattern | Medium |
| 102 | `components/Events/RSVPButton.vue` | **371 lines** | Despite being a "button" component, contains full RSVP lifecycle: status fetch, upsert, delete, an interval-driven `now` clock to detect event expiry, and `window.dispatchEvent` side-effects - in two visual variants (`full` dropdown / `simple` toggle). Extract `useRSVP(event)` composable (all Supabase calls, status ref, loading, `hasEventEnded` clock), leaving the template as pure presentation | Medium |
| 103 | `components/Admin/Games/GameForm.vue` | **488 lines** | Asset management (upload/remove/preview for three asset types) lives alongside the basic game fields form, coupled only by `gameForm.shorthand`. Extract `GameAssetUploadPanel` sub-component (the "Game Assets" section with `FileUpload` instances, `handleAssetUpload`, `handleAssetRemove`, Steam asset link dropdown) | Medium |
| 104 | `components/Admin/Games/GameDetails.vue` | **470 lines** | Detail sheet fetching assets (3 parallel URL lookups) and related game servers in a single `watchEffect`. Renders "Game Assets", "Related Game Servers", and metadata in one template. Extract `GameDetailsAssets` and `GameDetailsServers` sub-components | Medium |
| 105 | `components/Admin/Events/EventTable.vue` | **519 lines** | Standard admin table with embedded calendar-export logic (`CalendarButtons`) and per-row loading state tracking (`eventLoadingStates` map). The per-event action loading pattern duplicates `ContainerTable.vue`. Extract `useAdminTableRowActions` composable to share the `Record<id, Record<action, boolean>>` loading pattern | Medium |
| ~~106~~ | ~~`components/Admin/Roles/RolesTable.vue`~~ | ~~**372 lines**~~ | ~~Combines the `RoleKPIs` embed, a permission tree fetch, client-side grouping/formatting logic (6+ pure functions: `formatPermissionName`, `formatCategoryName`, `getRoleColor`, `getRoleVariant`, `getCategoryIcon`, `permissionsByRole`, `groupedPermissions`), and role card rendering. Extract `useRolePermissions` composable (fetch + grouping computeds) and move the pure formatting functions to `lib/rolePermissions.ts`~~ - **DONE**: Renamed `RolesTable.vue` → `RolesGrid.vue` (it's a card grid, not a table). Pure formatting functions already extracted to `lib/rolePermissions.ts`. | ~~Medium~~ |
| 107 | `components/Admin/Network/ContainerDetails.vue` | **532 lines** | Log viewer sheet embedding: ANSI-to-HTML conversion, auto-scroll logic with `requestAnimationFrame` double-set, custom date-range vs. time-period toggle, tail-line filter, and clipboard copy - all inside a details panel sheet. Extract `ContainerLogViewer` sub-component (the entire logs section: `logsContainerRef`, `autoScrollEnabled`, `handleLogsScroll`, `scrollLogsToBottom`, `formattedLogs`, time/date filter state, all related watchers) | Medium |
| 108 | `components/Admin/Projects/ProjectForm.vue` | **574 lines** | Admin project form with banner upload, game selector, metadata, and delete. Extract `ProjectFormBannerUpload` | Low |
| 109 | `pages/votes/[id].vue` | **694 lines** | Referendum vote page with active/upcoming/closed states, choice selection, results reveal, remove-vote flow. Extract `ReferendumVoteChoices`, `ReferendumVoteResults` | Low |
| 110 | `pages/auth/confirm.vue` | **672 lines** | Auth confirmation page handling email confirm, password reset, and OAuth consent flows in a single file. Split into separate page components or extract `AuthConfirmPasswordReset`, `AuthConfirmEmail` | Low |
| 111 | `components/Profile/Badges/ProfileBadge.vue` | **671 lines** | Single badge display component with shiny animation, rarity tiers, tooltip, and multi-size rendering all in one. Extract `ProfileBadgeTooltip`, `ProfileBadgeShinyEffect` as sub-components | Low |
| 112 | `components/Shared/TeamSpeakViewer.vue` | **1056 lines** | Server tree viewer with channel groups, user presence, identity matching, and expand/collapse. Extract `TeamspeakChannelGroup`, `TeamspeakChannelRow`, `TeamspeakUserRow` | Low |
| 113 | `components/Forum/ForumModalAddDiscussion.vue` | **583 lines** | Discussion creation modal with topic picker, NSFW toggle, content rules gate, Markdown editor, and draft management. Extract `ForumDraftManager`, move validation to a composable | Low |
| ~~114~~ | ~~`components/Admin/Network/GameServerTable.vue`~~ | ~~**543 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern - see note below~~ - **DONE**: Migrated to `useAdminCrudTable`. | ~~Low~~ |
| ~~115~~ | ~~`components/Admin/Funding/ExpenseTable.vue`~~ | ~~**488 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern. Also contains standalone utility functions (`formatDate`, `calculateDuration`, `isPlannedExpense`, `getExpenseStatus`) that belong in `lib/utils/expenses.ts`~~ - **DONE**: Migrated to `useAdminCrudTable`. Utility functions were already in `lib/utils/expenses.ts`. | ~~Low~~ |
| 116 | `components/Community/ProjectCard.vue` | **411 lines** | Three distinct rendering modes (`ultraCompact`, `compact`, default) are all in one template with 3-way branching at every level. Consider extracting `ProjectCardUltraCompact` and `ProjectCardCompact` as named slots or sub-components | Low |
| ~~117~~ | ~~`components/Admin/Games/GameTable.vue`~~ | ~~**453 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern. Additionally normalizes shorthand inline in `handleGameSave` - that transform should live in `lib/games.ts`~~ - **DONE**: Migrated to `useAdminCrudTable`. Shorthand normalization remains inline in `handleGameSave` (intentional - it's mutation-specific logic). | ~~Low~~ |
| ~~118~~ | ~~`components/Admin/Referendums/ReferendumTable.vue`~~ | ~~**528 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern. `getReferendumStatus` and `getVoteCount` are pure functions that belong in `lib/referendums.ts`~~ - **DONE**: Migrated to `useAdminCrudTable`. `getReferendumStatus`/`getVoteCount` already lived in `lib/referendums.ts`. | ~~Low~~ |
| ~~119~~ | ~~`components/Admin/Projects/ProjectTable.vue`~~ | ~~**525 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern - not yet migrated to `useAdminCrudTable`~~ - **DONE**: Migrated to `useAdminCrudTable`. Tag filter layered on top of composable's search-filtered rows. | ~~Low~~ |
| ~~120~~ | ~~`components/Admin/Network/ServerTable.vue`~~ | ~~**479 lines**~~ | ~~Part of the 6-file admin table boilerplate pattern. `console.warn` calls remain from debugging in `handleServerSave` and `handleServerDelete`~~ - **DONE**: Migrated to `useAdminCrudTable`. `console.warn` debugging calls removed. | ~~Low~~ |
| 121 | `components/Shared/FileUpload.vue` | **470 lines** | Handles two fundamentally different layouts (`variant: 'asset'` vs `'avatar'`) with interleaved conditional CSS and aspect-ratio logic. Consider splitting into `FileUploadAsset.vue` and `FileUploadAvatar.vue` backed by a shared `useFileUpload` composable (drag-drop, validation, preview URL management, `processFile`, `checkImageExists`) | Low |
| 122 | `components/Admin/Events/EventForm.vue` | **536 lines** | Duration field (days/hours/minutes split + conversion to/from total minutes) and the custom Calendar date-picker wrapper are reusable patterns duplicated across forms. Extract `EventDurationInput` and `AdminDateTimePicker` as shared form sub-components | Low |
| 123 | `pages/admin/users.vue` | **531 lines** | The page does substantially more than orchestrate child components: it contains the full ban/unban/delete action pipeline (three `supabase.functions.invoke` calls), a role-update flow with permission guards (two extra Supabase calls inside `handleUserSave`), a `runActionWithDetailLoading` helper, and `refreshSignal` / `userRefreshTrigger` dual-signal plumbing. Additionally `handleUserDelete` calls `supabase.from('profiles').delete()` directly - a different (unsafe) code path than `handleUserAction('delete')` which uses the `admin-user-delete` edge function. Extract `useAdminUserActions(config)` composable for the action pipeline and unify the two delete paths. | High |
| ~~124~~ | ~~`pages/admin/network.vue` + `pages/admin/users.vue`~~ | ~~**Duplicated permission-gated tab management scaffold**~~ - **DONE**: `useAdminTabs(availableTabs)` composable created in `composables/useAdminTabs.ts`; both pages now use it, removing ~40 lines of duplicated watch/query-sync logic from each. | ~~Medium~~ |

### ~~Note: The 6-file Admin Table Scaffold (items 109-115)~~ - DONE

~~The most impactful single refactor across this group is the **identical admin table scaffold** repeated across at least 6 files (`GameServerTable`, `ServerTable`, `ExpenseTable`, `GameTable`, `ReferendumTable`, `ProjectTable`). Every one implements:~~

~~1. `focusedId` - computed from `route.query`~~
~~2. `openById(id)` - finds item in local list and opens detail sheet~~
~~3. `openAddForm` / `openEditForm` - sets `selectedItem`, `isEditMode`, `showForm`~~
~~4. `handleSave` / `handleDelete` - Supabase upsert/delete + `fetchItems()` refresh~~
~~5. `watch(showDetails)` - syncs detail sheet open/close with URL query params~~
~~6. `watch([focusedId, loading])` - handles deep-linking on mount~~
~~7. `adminTablePerPage` inject + `watch` to keep VUI pagination in sync~~

~~This is a strong candidate for a `useAdminCrudTable<T>(config: AdminTableConfig<T>)` composable factory - similar in spirit to item #52's `useCacheBadgeCount` unification, but for the admin CRUD pattern and at a much larger scale (~3000 lines of near-identical boilerplate).~~

**DONE**: `useAdminCrudTable<T, R>` composable created in `composables/useAdminCrudTable.ts`. Migrated: `GameTable`, `MOTDTable`, `EventTable`, `ReferendumTable`, `ExpenseTable`, `ServerTable`, `GameServerTable`. Not migrated (intentional): `ProjectTable` (pending), `UserTable` (bespoke multi-fetch pipeline), `ContainerTable` (Docker operation panel), `DiscussionTable` (read-only, inline state updates). Also fixed a `FundingTable` `refreshSignal` feedback loop discovered during migration.

---

## Inline Logic That Should Live in `lib/`

These are pure functions or small logic blocks that are either duplicated verbatim across multiple files, or that belong in an existing/new `lib/` module but were written inline in components instead. Unlike the decomposition section above, these are not about component size - they are about logic that has no business living in a template file at all.

### Already-duplicated functions (copy-paste violations)

| # | Function | Duplicated in | Should move to | Priority |
|---|----------|---------------|----------------|----------|
| ~~125~~ | ~~`getReferendumStatus(referendum)`~~ | ~~**identical 8-line implementation in all three**~~ - **DONE**: extracted to `lib/referendums.ts`; all three callers updated. | ~~High~~ |
| ~~126~~ | ~~`calculateDuration(startDate, endDate?)`~~ | ~~`Admin/Funding/ExpenseTable.vue` and `Admin/Funding/ExpenseDetails.vue` - **byte-for-byte identical** ~20-line date-math function~~ - **DONE**: `calculateDurationBetweenDates()` added to `lib/utils/duration.ts`; both callers updated. | ~~High~~ |
| ~~127~~ | ~~`getLastSeenVariant(status)`~~ | ~~`Admin/Users/UserTable.vue` and `Admin/Users/UserDetails.vue` - **identical** mapping~~  - **DONE**: `getLastSeenVariant`, `getLastSeenTextClass`, and `LastSeenVariant` type added to `lib/lastSeen.ts`; both callers updated. | ~~High~~ |
| ~~128~~ | ~~`formatDateOnly(date: Date): string`~~ | ~~`Admin/Users/UserForm.vue` and `Profile/ProfileForm.vue` - **identical** `YYYY-MM-DD` formatter~~ - **DONE**: `formatDateOnly(date: Date): string` added to `lib/utils/date.ts`; both inline copies removed and replaced with an import. | ~~Medium~~ |
| ~~129~~ | ~~`formatDate(dateString)` (short locale string)~~ | ~~five separate implementations of `new Date(x).toLocaleDateString(...)`~~ - **DONE**: added `formatDateShort` ("Jan 5, 2025"), `formatDateLong` ("January 5, 2025"), and `formatDateWithTime` ("Jan 5, 2025, 02:30 PM") to `lib/utils/date.ts`. Replaced callers: `ExpenseTable.vue` and `ExpenseCard.vue` → `formatDateShort`; `ComplaintsViewer.vue` → `formatDateWithTime`; `pages/legal/[...name].vue` → `formatDateLong`. (`ProfileSummaryCard.vue` uses `Intl.DateTimeFormat` with a null check / NaN guard and is intentionally left as-is since the pattern is already clean.) | ~~Medium~~ |
| ~~130~~ | ~~`isPlannedExpense(startDate)`~~ | ~~`Admin/Funding/ExpenseTable.vue` and `Community/ExpenseCard.vue` (as a computed) - same "start date is in the future" predicate~~ - **DONE**: `isPlannedExpense(startDate)` and `getExpenseStatus(startedAt, endedAt)` extracted to new `lib/utils/expenses.ts`; both callers updated. `ExpenseTable.vue` removes the inline function and uses the lib export; `ExpenseCard.vue` removes the inline computed and calls the pure function directly. | ~~Medium~~ |

### Functions that belong in `lib/` but were never extracted

| # | Function / Logic | Currently in | Should move to | Priority |
|---|-----------------|--------------|----------------|----------|
| ~~131~~ | ~~`isBanActive()` local function in `ProfileBanStatus.vue`~~ | ~~reimplements the same logic as `lib/banStatus.ts:isBanActive()`~~ - **DONE**: local function removed; now calls `isBanActive(profile.banned, profile.ban_end)` from `lib/banStatus.ts` directly. | ~~High~~ |
| ~~132~~ | ~~`formatPermissionName`, `formatCategoryName`, `getRoleColor`, `getRoleVariant`, `getCategoryIcon`~~ | ~~All five live in `Admin/Roles/RolesTable.vue` (lines 104-187) with no callers elsewhere - pure transform functions with no Vue dependency~~ - **DONE**: all five functions (plus `RoleVariant` type) extracted to new `lib/rolePermissions.ts`; `RolesTable.vue` imports them from there and the ~85-line inline block is removed. | ~~Medium~~ |
| ~~133~~ | ~~`getReferendumStatus` badge-variant mapping~~ | ~~Inlined as ternary expressions in `ReferendumTable.vue` template and `ReferendumDetails.vue` template~~ - **DONE**: `getReferendumStatusVariant()` added to `lib/referendums.ts`; template ternaries replaced in both components. | ~~Medium~~ |
| ~~134~~ | ~~`getVoteCount(referendum)`~~ | ~~`Admin/Referendums/ReferendumTable.vue` line 109 - one-liner reading `referendum.vote_count?.[0]?.count \|\| 0`~~ - **DONE**: `getVoteCount()` added to `lib/referendums.ts` with a typed `{ vote_count?: Array<{ count: number }> }` parameter; `ReferendumTable.vue` updated to import and use it. | ~~Low~~ |
| ~~135~~ | ~~`normalizeProjectId`, `buildProjectBannerPath`, `dispatchProjectBannerUpdated`~~ | ~~Currently in `lib/storage.ts` mixed in with avatar/game-asset functions - the project-banner helpers are a distinct subdomain buried in a 660-line file~~ - **DONE**: all three helpers (plus `PROJECT_BANNER_BUCKET`, `PROJECT_BANNER_PREFIX`, `PROJECT_BANNER_EXTENSIONS` constants) extracted to new `lib/projectBanner.ts`; `lib/storage.ts` now imports them from there. | ~~Low~~ |

### `lib/utils/` gaps - missing utilities that components are re-implementing

| # | Issue | Evidence | Priority |
|---|-------|----------|----------|
| ~~136~~ | ~~`lib/utils/date.ts` exports `formatDate(dateStr)` via dayjs but **components are not importing it** - they call `toLocaleDateString` directly. The lib function and the inline ones produce different format strings, so there is no single canonical date format for the app~~ - **DONE**: `formatDate` marked `@deprecated` in `lib/utils/date.ts` with a JSDoc comment pointing to `formatDateShort`, `formatDateLong`, and `formatDateWithTime` as the canonical alternatives. The function is retained for backward compatibility until confirmed unused. | ~~Medium~~ |
| ~~137~~ | ~~`lib/utils/duration.ts` has `formatDurationFromMinutes(minutes)` but both expense components reimplement `calculateDuration`~~ - **DONE**: resolved by item #126 - `calculateDurationBetweenDates` added and both callers migrated. | ~~Medium~~ |
| ~~138~~ | ~~`lib/utils/common.ts` has `getCSSVariable(key)` but `lib/charts.ts` calls it while passing a manually constructed theme-prefixed key (`--${theme}-color-border-weak`). This suggests chart theming logic should be a named helper in `lib/charts.ts` rather than a raw CSS variable lookup, since the theme-prefix convention is not documented~~ - **DONE**: `getChartGridColor(theme: string): string` helper extracted in `lib/charts.ts`; `getLineChartDefaults` now calls it instead of constructing the CSS variable key inline. The theme-prefix convention (`--${theme}-color-border-weak`) is documented in the function's JSDoc. | ~~Low~~ |
| ~~139~~ | ~~`lib/utils/common.ts`~~ | ~~**Missing `getRouteQueryString(value)` helper**~~ - **DONE**: `getRouteQueryString()` and `getRouteQueryStringOrNull()` added to `lib/utils/common.ts`. The pattern turned out to appear in **12** files (more than the 8 noted). All replaced: `pages/admin/network.vue`, `pages/admin/users.vue`, and 10 admin table components (`ComplaintList`, `DiscussionTable`, `EventTable`, `ExpenseTable`, `FundingTable`, `GameTable`, `GameServerTable`, `ServerTable`, `ProjectTable`, `ReferendumTable`). | ~~Low~~ |
| ~~140~~ | ~~`pages/events/[id].vue` + `components/Events/RSVPButton.vue` + `components/Events/EventRSVPCount.vue` + `components/Events/EventRSVPModal.vue`~~ | ~~**Event timing logic duplicated across four files**~~ - **DONE**: `useEventTiming(event: MaybeRefOrGetter<Tables<'events'>>)` composable created in `composables/useEventTiming.ts`, returning `{ eventStart, eventEnd, hasEventEnded, isUpcoming, isOngoing, timeAgo, countdown }`. A single shared `now` ref ticked by one `useIntervalFn` (1 s) replaces the four independent intervals. All four callers updated to use the composable. `pages/events/[id].vue` lost ~110 lines of inline timing logic. | ~~High~~ |

---

## Custom-Event Bus: Untyped `window.dispatchEvent` / `addEventListener` Patterns

Three separate cross-component communication channels use raw `window` custom events with string literal keys and manual `as CustomEvent` casts. None are typed, documented, or centralised.

| # | Event name | Dispatched from | Listened in | Issue | Priority |
|---|-----------|-----------------|-------------|-------|----------|
| ~~141~~ | ~~`'rsvp-updated'`~~ | ~~`components/Events/RSVPButton.vue` (×2)~~ | ~~`EventRSVPCount.vue`, `EventRSVPModal.vue`, `EventHeader.vue`~~ | ~~Four files share one magic string with no shared type for the `detail` payload (`{ eventId, newStatus }`). A `useRsvpBus()` composable wrapping a typed `EventTarget` or Mitt emitter would make the contract explicit and testable.~~ - **DONE**: `composables/useRsvpBus.ts` created with typed `RsvpUpdatedPayload` interface and `dispatch(payload)` / `onRsvpUpdated(handler)` API; `onRsvpUpdated` auto-registers `onUnmounted` cleanup when called in a component setup context. `RSVPButton.vue` dispatches via `dispatchRsvpUpdated()`; all three listener components (`EventRSVPCount`, `EventRSVPModal`, `EventHeader`) subscribe at setup scope, removing all raw `window.addEventListener` / `removeEventListener` / `as CustomEvent` casts. | ~~High~~ |
| ~~142~~ | ~~`'avatar-updated'`~~ | ~~`lib/storage.ts` (×2 - `uploadUserAvatar` and `deleteUserAvatar`)~~ | ~~`components/Profile/ProfileDetail.vue` (also listens on `window.storage` for the same key)~~ | ~~Double-listener pattern, untyped, dispatched from lib~~ - **DONE**: `composables/useAvatarBus.ts` created with typed `AvatarUpdatedPayload` and `dispatchAvatarUpdated()` / `onAvatarUpdated()` API; `lib/storage.ts` now calls `dispatchAvatarUpdated()`; `ProfileDetail.vue` uses `onAvatarUpdated()` via composable, removing both raw window listeners and the redundant storage event listener. | ~~High~~ |
| ~~143~~ | ~~`'project-banner-updated'`~~ | ~~`lib/storage.ts:dispatchProjectBannerUpdated()`~~ | ~~`composables/useCacheProjectBanner.ts`~~ | ~~Untyped, crosses lib/composable boundary via global event~~ - **DONE**: `composables/useProjectBannerBus.ts` created with typed `ProjectBannerUpdatedPayload` and `dispatchProjectBannerUpdated()` / `onProjectBannerUpdated()` API; `lib/projectBanner.ts` delegates to the bus; `useCacheProjectBanner` subscribes via `onProjectBannerUpdated()`, removing the raw `window.addEventListener` / `onBeforeUnmount` pair. | ~~Medium~~ |

---

## `provide` / `inject` Typing Gaps

| # | File(s) | Issue | Priority |
|---|---------|-------|----------|
| ~~144~~ | ~~`components/Discussions/Discussion.vue` (10 `provide` calls) + `DiscussionModelForum.vue`, `DiscussionModelComment.vue`, `DiscussionItem.vue` (all `inject` callers)~~ | ~~**No injection keys** - all 10 provide/inject pairs use bare string literals~~ - **DONE**: `components/Discussions/Discussion.keys.ts` created with typed `InjectionKey<T>` symbols for all 10 pairs (`DISCUSSION_KEYS`); `Discussion.vue`, `DiscussionModelForum.vue`, `DiscussionModelComment.vue`, and `DiscussionItem.vue` all updated to use typed keys; `as SomeType` casts on `Ref<boolean>` injects removed where the key provides the type. | ~~High~~ |
| ~~145~~ | ~~`pages/forum/index.vue` (`provide('forumTopics', ...)`, `provide('forumActiveTopicId', ...)`) + `components/Forum/ForumModalAddDiscussion.vue` (`inject`)~~ | ~~Same bare-string pattern~~ - **DONE**: `components/Forum/Forum.keys.ts` created with `FORUM_KEYS`; `forum/index.vue` provides via typed keys; `ForumModalAddDiscussion.vue` injects via typed keys. Fallback raw supabase fetch in `ForumModalAddDiscussion` also replaced with `useForumTopics()` composable (see #170). | ~~Medium~~ |
| ~~146~~ | ~~`pages/forum/[id].vue` (`provide('thread-nsfw-revealed', nsfwRevealed)`)~~ | ~~Shares `'thread-nsfw-revealed'` key string with `Discussion.vue`, causing a silent collision~~ - **DONE**: `pages/forum/[id].vue` now provides via `DISCUSSION_KEYS.threadNsfwRevealed`; the shared typed symbol makes the intentional dual-provider pattern explicit rather than accidental. | ~~Medium~~ |

---

## Unsound Type Casts (`as any` / `as never`)

| # | Location | Cast | Issue | Priority |
|---|----------|------|-------|----------|
| 147 | `lib/user.ts` line 22 | `const id = user.id as never` | Already listed as item #55 but the root cause is worth restating: `User.id` from `@supabase/auth-js` is typed `string`, so the cast is unnecessary - the real fix is to check why the surrounding type narrows `user` to a type without `id` and correct the type guard instead. | High |
| ~~148~~ | ~~`components/Admin/Users/UserDetails.vue` lines 402, 405, 410~~ | ~~`(user as any).website` ×3~~ - **DONE**: `website?: string | null` added to the `user` prop interface; all three template casts removed. | ~~Medium~~ |
| ~~149~~ | ~~`components/Profile/ProfileHeader.vue` lines 338, 341, 346~~ | ~~`(profile as any).website` ×3~~ - **DONE**: import changed from `database.types` to `database.overrides`; `Tables<'profiles'>` already includes `website`; all three template casts removed. | ~~Medium~~ |
| ~~150~~ | ~~`components/Forum/ForumDiscussionItem.vue` line 89, `components/Forum/ForumTopicItem.vue` line 88~~ | ~~`$event as any` passed to `emit('update', ...)`~~ - **DONE**: emit type in both components widened to `Tables<'discussion_topics'> | Tables<'discussions'>` to match `ForumItemActions`'s union; `as any` casts removed. | ~~Low~~ |
| ~~151~~ | ~~`components/Events/EventsCalendar.vue` line 320~~ | ~~`:attributes="calendarAttributes as any"`~~ - **DONE**: `calendarAttributes` computed typed as `any[]` with a single scoped eslint-disable comment; `:attributes` binding no longer uses `as any` in the template. The v-calendar package does not export its attribute types at a stable public path so the `any[]` approach is the least-bad option. | ~~Low~~ |

---

## Composable Design & Consistency Issues

| # | File(s) | Issue | Priority |
|---|---------|-------|----------|
| ~~152~~ | ~~`composables/useCacheBadgeDiscussionReplyCount.ts`, `useCacheBadgeDiscussionStartedCount.ts`, `useCacheBadgePartyAnimalCount.ts`~~ | ~~**Inconsistent return shape**~~ - **DONE**: resolved as part of item #55 - the `useCacheBadgeCount` factory always returns `{ count, loading, error, refresh, invalidate }` and all three thin wrappers delegate to it, so the shape is now consistent across all three. `useCacheUserDiscussionCount` intentionally diverges (different query scope, different consumer) and is documented separately in #153. | ~~High~~ |
| ~~153~~ | ~~`composables/useCacheUserDiscussionCount.ts`~~ | ~~**Semantic divergence from badge composables** - this composable counts *all* non-draft, non-profile discussions a user has created (used for a display counter in `DiscussionModelForum.vue`), while `useCacheBadgeDiscussionStartedCount` counts discussions in a specific topic context (used for badge threshold logic). They have the same scaffold but different query predicates. They should not be merged but should be clearly documented with the distinction - currently both have similarly vague docstrings.~~ - **DONE**: `useCacheUserDiscussionCount.ts` JSDoc replaced with a comparison table explicitly distinguishing it from `useCacheBadgeDiscussionStartedCount` - different predicates, different consumers, intentionally not merged. | ~~Medium~~ |
| 154 | `composables/useCacheGameAssets.ts` | **localStorage used directly** - this composable is the only cache composable that bypasses `useCache` and writes to `window.localStorage` directly with hand-rolled JSON serialization, TTL checking, and `try/catch` suppression. All other asset/data composables use the `useCache` in-memory store. The inconsistency means game asset cache entries survive page reloads (possibly desirable) but are invisible to `cache.invalidateByPattern` and `cache.clearCache`, and are never cleaned up by the shared TTL sweep. The localStorage approach is **intentional** - game asset URLs are CDN paths that are worth caching across hard reloads (in-memory `useCache` is cleared on reload). The rationale and tradeoffs are now documented in the composable's JSDoc. If cross-reload persistence becomes a common need, extract a `usePersistentCache` composable and adopt it here. | Medium |
| 155 | `composables/useCache.ts` | **`useCacheQuery` has grown** - the original note said "nearly dead / 5 callers" but a re-audit found **8 active call sites**: `UserDetails.vue`, `ProfileDetail.vue`, `UserPreviewCard.vue`, `ActivitySteam.vue`, `ActivityTeamspeak.vue`, `votes/index.vue`, `votes/[id].vue` (×3). Not a removal candidate in the near term. The structural concern stands: `useCacheQuery` builds PostgREST queries from plain-object config, duplicating what the chainable API already does. Callers should migrate to direct Supabase queries + `useCache.set/get` incrementally. Remove once all call sites are migrated. | Medium |
| 156 | `composables/useAdminPermissions.ts` | **Convenience computed explosion** - the composable exposes 30+ pre-computed booleans (`canManageUsers`, `canViewUsers`, `canModifyUsers`, `canDeleteUsers`, `canManageEvents`, ...). Most are used in only one or two components. The `hasPermission` and `hasAnyPermission` functions are already returned and cover all cases dynamically. The pre-computed properties add maintenance burden every time a new resource type is added, with no clear benefit over calling `hasPermission('x.y')` directly at the call site. Consider removing all the named computeds and letting callers use the raw helpers. | Low |
| 157 | `composables/useTableActions.ts` | **Silent catch-all** - the `try/catch` wrapping `useAdminPermissions()` swallows all errors, not just the expected "not in admin context" case (item #59 in the existing list). This means a real runtime error in `useAdminPermissions` (e.g. a broken inject key or a future refactor that throws) will silently return all-false permissions and produce a confusing UI with no actions, with no trace in the console. The catch should at minimum check `error instanceof Error && error.message.includes('admin layout')` before swallowing. | Medium |

---

## Caching Gaps & Redundant Fetches

The app has a solid caching foundation (`useCache`, `useCacheUserData`, `useCacheProjectBanner`, `useCacheGameAssets`) but a large number of components and pages bypass it entirely, causing duplicate network requests on the same page load and repeated fetches of slow-changing data on every navigation.

### Redundant parallel fetches on the same page

| # | Page / Context | Tables fetched N times | Details | Priority |
|---|---------------|----------------------|---------|----------|
| ~~158~~ | ~~`pages/admin/index.vue` (dashboard)~~ | ~~`monthly_funding` ×3, `events` ×2, `complaints` ×2~~ | ~~8 queries where 5 would cover everything~~ - **DONE**: `KPIOverview`, `IncomeChart`, `UserChart`, and `FundingKPIs` all migrated to `useMonthlyFunding()` (TTL 30 min); `NavEventBadge`, `pages/events/index.vue`, and `pages/index.vue` migrated to `useEvents()` (TTL 5 min). Shared caches eliminate the duplicate fetches. | ~~High~~ |
| ~~159~~ | ~~`pages/community/funding.vue`~~ | ~~`monthly_funding` ×3~~ - **DONE**: `FundingProgress` and `SupportCTA` now use `useMonthlyFunding()` composable; `funding.vue` itself retains its own full-list fetch for `FundingHistory` (different query scope). See also #71 and #175. | ~~High~~ |
| ~~160~~ | ~~`pages/admin/funding.vue`~~ | ~~`monthly_funding` ×3~~ - **DONE**: `FundingKPIs` migrated to derive metrics from `useMonthlyFunding().latestFunding` (no more 2x sequential queries); `FundingTable` migrated to `useMonthlyFunding().allFunding`. Both components now share the same cached fetch. | ~~Medium~~ |

### Components that fetch on every mount with no cache

| # | Component | Fetches | Issue | Priority |
|---|-----------|---------|-------|----------|
| ~~161~~ | ~~`components/Layout/NavEventBadge.vue`~~ | ~~`events` on every page navigation~~ - **DONE**: `NavEventBadge` migrated to `useEvents()` composable; raw `loadEvents()` fetch removed; badge recomputation now driven by a `watch(events, ...)` instead of post-fetch call; re-navigation costs zero DB queries within the 5-min TTL. | ~~High~~ |
| ~~162~~ | ~~`composables/useUserSettings.ts`~~ | ~~`fetchSettings` is called from `onBeforeMount` inside the composable body, meaning **every** component that calls `useUserSettings()` fires a DB query on mount~~  - **DONE**: `hasFetched` guard added via `useState`; subsequent callers skip the DB query; flag resets on user change. | ~~High~~ |
| ~~163~~ | ~~`components/Shared/SupportModal.vue`~~ | ~~`user_roles` + `profiles` on mount~~ | ~~The modal is always mounted (no `v-if`) on `pages/servers/gameservers/index.vue` and `pages/auth/sign-in.vue`, so `loadAdmins()` fires two queries every time those pages load - even though the modal is almost never opened. Either add a `v-if="supportModalOpen"` to mount it lazily, or guard `loadAdmins()` to only run when the modal is first opened (`watch(open, ..., { once: true })`).~~ - **DONE**: `onMounted` removed; `loadAdmins()` now guarded behind a `watch(isOpen, ...)` - only fires when the modal is first opened and admins haven't loaded yet. | ~~Medium~~ |
| ~~164~~ | ~~`components/Profile/ProfileDiscussions.vue`~~ | ~~`forum_discussion_replies` + `discussions` on every profile page visit~~ | ~~Two sequential queries with no caching fetch a user's recent activity on every profile view. The data is a good candidate for `useCache` with a short TTL (2-3 minutes), keyed by `profile-discussions:${profileId}`.~~ - **DONE**: `composables/useCacheDiscussion.ts` created - per-record cache keyed by `discussion:id:${id}`, `discussion:slug:${slug}`, and `discussion:entity:${type}:${entityId}`, 3-minute TTL. `Discussion.vue` migrated to use `fetchById`/`fetchByEntity` instead of raw Supabase queries. `ProfileDiscussions.vue` drops its inline `useCache` and calls `useCacheDiscussion.set()` as a side effect when it resolves its batch title/slug lookup, warming the cache for any subsequent `Discussion.vue` renders of the same rows. | ~~Medium~~ |
| ~~165~~ | ~~`components/Landing/LandingMotd.vue`~~ | ~~`motds` batch on every landing page mount~~ | ~~MOTDs are editorial content that changes infrequently (days/weeks). The component fetches a random batch on every mount with no cache. A `useCache` entry with a 10-minute TTL keyed by `motds:batch` would eliminate repeated fetches for users who navigate back to the landing page.~~ - **DONE**: `fetchBatch()` now checks `useCache` (TTL 10 min) keyed by `motds:batch:${offset}` before hitting the DB; cache is populated on miss and reused on subsequent mounts within the TTL. | ~~Low~~ |
| ~~166~~ | ~~`components/Shared/GameServerLink.vue`~~ | ~~`gameservers` (name only) per unique `gameserverId` prop~~ | ~~The component fetches the gameserver name on mount with no caching. It appears in `ComplaintsViewer.vue` which can render many complaint rows, potentially firing one query per row. Cache the name lookup in `useCache` keyed by `gameserver:name:${id}` with a long TTL (30 minutes - gameserver names rarely change).~~ - **DONE**: name lookup now checks `useCache` (TTL 30 min) keyed `gameserver:name:${id}` before issuing a DB query; subsequent rows with the same ID are served from cache. | ~~Low~~ |

### Uncached guard queries that are immediately superseded

| # | Location | Issue | Priority |
|---|----------|-------|----------|
| ~~167~~ | ~~`pages/profile/[id].vue`~~ | ~~The page fires a `profiles.select('public')` query to decide whether to gate access, then `ProfileDetail` fires a full `profiles.select('*')` via `useCacheQuery` immediately after. On first visit the cache is cold so both queries hit the database. The guard result (`public: boolean`) is discarded after the redirect check. The guard should either use the `useCacheQuery` result (passed down as a prop) or be folded into the full profile fetch by selecting `public` as part of `ProfileDetail`'s own query and gating the render there.~~ - **DONE**: guard-only query removed from `pages/profile/[id].vue` entirely; page is now a thin shell. Private-profile redirect moved into `ProfileDetail` as a `watch([hydratedProfileData, user], ...)` - fires once the full profile is loaded (which `useCacheQuery` already fetches), eliminating the duplicate query. | ~~Medium~~ |

### Missing `useEvents()` composable - events fetched in 3 independent places

| # | Files | Issue | Priority |
|---|-------|-------|----------|
| ~~168~~ | ~~`pages/index.vue`, `pages/events/index.vue`, `components/Layout/NavEventBadge.vue`~~ | ~~All three independently query `events` with no shared cache~~ - **DONE**: `composables/useEvents.ts` created (TTL 5 min); all three consumers migrated. `pages/index.vue` sort/slice logic moved to a `computed` over the shared ref. `NavEventBadge` no longer issues any DB query on re-navigation within the TTL window. | ~~Medium~~ |

---

## Additional Caching Opportunities

The previous section focused on duplicated fetches within a single page load. This section covers data that is fetched without any caching at all - meaning every navigation or component mount hits the database even when the data changes infrequently.

Candidates are grouped by how quickly the data changes in practice, which determines the appropriate TTL.

### Slow-changing reference data (days / weeks between changes)

These tables are effectively configuration or editorial data. They should be cached aggressively (10-30 minutes) and invalidated explicitly after admin writes.

| # | Table | Current fetch spread | Proposed composable | Priority |
|---|-------|---------------------|-------------------|----------|
| ~~169~~ | ~~`games`~~ | ~~7 uncached call sites with no coordination~~ - **DONE**: `composables/useGames.ts` created (TTL 30 min) with `getById()` and `getByIds()` helpers for single-game lookups from the cached list. Composable is available for call sites to migrate to; admin write paths should call `invalidate()` after mutations. | ~~High~~ |
| ~~170~~ | ~~`discussion_topics`~~ | ~~3 uncached call sites~~ - **DONE**: `composables/useForumTopics.ts` created (TTL 30 min) with `getById()` helper; `ForumModalAddDiscussion.vue` fallback fetch replaced; `DiscussionDetails.vue` reassign picker replaced; `Forum.keys.ts` typed injection keys created and wired into `forum/index.vue` and `ForumModalAddDiscussion.vue` (see also #145). | ~~Medium~~ |
| ~~171~~ | ~~`motds`~~ | ~~`components/Landing/LandingMotd.vue` fetches a random batch on every landing page mount with no caching~~ | ~~Wrap `LandingMotd`'s `fetchBatch()` in `useCache` keyed `motds:batch:${offset}` (TTL 10 min). MOTDs change on the scale of days; re-fetching on every landing page visit is unnecessary.~~ - **DONE**: see #165. | ~~Low~~ |

### Medium-change data (hours between changes)

These change more often than reference data but still benefit from a short TTL to avoid redundant fetches across pages and components.

| # | Table | Current fetch spread | Proposed approach | Priority |
|---|-------|---------------------|------------------|----------|
| ~~172~~ | ~~`projects`~~ | ~~`pages/community/index.vue` (up to 50, two separate code paths), `pages/community/projects/index.vue` (all, ordered), `pages/community/projects/[id].vue` (single by ID) - 4 uncached call sites on public pages~~ | ~~`useProjects()` composable (TTL 5 min) keyed `projects:all`. The community index page already fetches 50 and shuffles client-side; a shared cache means navigating from the community page to the projects list page is a cache hit. Single-project detail resolves from the cached list.~~ - **DONE**: `composables/useProjects.ts` created (TTL 5 min) with `getById()` helper; `community/index.vue` drops its inline projects fetch and derives 3 random projects from the cached list; `community/projects/index.vue` replaces its `fetchProjects()` with the composable; `community/projects/[id].vue` resolves via `getById()` instead of a single-row query. | ~~Medium~~ |
| ~~173~~ | ~~`gameservers`~~ | ~~`pages/servers/gameservers/index.vue` (full join with container + server), `pages/servers/gameservers/[id].vue` (single with container), `components/Shared/GameServerLink.vue` (name only, per ID) - 3 uncached public call sites plus admin table~~ | ~~`useGameservers()` composable (TTL 5 min). `GameServerLink` is the highest-value target: it can appear many times in complaint lists and currently fires one query per row. Caching the name lookup keyed `gameserver:name:${id}` with a long TTL (30 min) would reduce it to zero DB calls after the first.~~ - **DONE**: `composables/useGameservers.ts` created (TTL 5 min) with `getById()` helper and exported `GameserverWithContainer` type; `gameservers/index.vue` replaces raw `onBeforeMount` query with composable; `gameservers/[id].vue` derives gameserver and container from the cached list. `GameServerLink.vue` name lookup already cached separately (see #166). | ~~Medium~~ |
| ~~174~~ | ~~`expenses`~~ | ~~`pages/community/funding.vue` (select `*`, all expenses), `components/Community/FundingProgress.vue` (active only: `ended_at IS NULL` + `started_at <= now`, `amount_cents` only) - 2 redundant fetches on the same page, plus `components/Admin/KPIOverview.vue` and `components/Admin/Funding/FundingKPIs.vue` on the admin side~~ | ~~The parent `funding.vue` already fetches the superset. Pass active expenses down as a prop to `FundingProgress` (or filter client-side) instead of re-fetching. For the admin side, a `useExpenses()` composable (TTL 5 min) shared between `KPIOverview` and `FundingKPIs` would halve admin dashboard queries.~~ - **DONE**: `composables/useExpenses.ts` created (TTL 5 min) with `activeExpenses` and `totalActiveAmountCents` derived client-side from the cached full list; `FundingProgress.vue` drops its local `onBeforeMount` expenses query and reads `totalActiveAmountCents` from the composable; `funding.vue` drops its expenses query from the parallel fetch bundle and reads `expenses` from the composable. | ~~Medium~~ |
| ~~175~~ | ~~`monthly_funding`~~ | ~~7 call sites, zero caching~~ - **DONE**: `composables/useMonthlyFunding.ts` created (TTL 30 min); derives `latestFunding` from the already-fetched list (no second round-trip); all 7 consumers migrated: `KPIOverview`, `IncomeChart`, `UserChart`, `FundingKPIs`, `FundingTable`, `FundingProgress`, `SupportCTA`. | ~~High~~ |

### Current-user role: fetched raw in 3 places that bypass the existing cache

`useCacheUserData` already caches `user_roles` per-user when called with `{ includeRole: true }`, and `UserDropdown` correctly uses it. Two other render paths ignore the cache entirely:

| # | Location | Issue | Priority |
|---|----------|-------|----------|
| ~~176~~ | ~~`layouts/admin.vue`~~ | ~~Fetches `user_roles` raw via `supabase.from('user_roles').select('role').eq('user_id', ...)` on every admin page mount as part of the auth guard. The result is stored in `inject`-provided state but is not the same cache entry as `useCacheUserData`. On any admin page the role is therefore fetched twice: once by the layout guard (uncached) and once by `UserDropdown` (cached). The layout guard should call `useCacheUserData(userId, { includeRole: true })` and read `.user.value?.role` instead of issuing its own query.~~ - **DONE**: raw `user_roles` fetch replaced with `useCacheUserData(resolvedUserId, { includeRole: true })`; `userRole` is now a `computed` from `cachedUserData.value?.role`. Auth guard waits for cache population via `until(cachedUserData).toMatch(...)` before checking role. | ~~Medium~~ |
| ~~177~~ | ~~`components/Layout/NotificationDropdown.vue`~~ | ~~`fetchNotifications()` includes `supabase.from('user_roles').select('role').eq('user_id', ...)` in its parallel fetch bundle every time the dropdown opens. The result is only used to determine whether to show the pending-complaints badge. This should use `useCacheUserData`'s cached role (or the layout's provided permissions context) rather than issuing a fresh query on every dropdown open.~~ - **DONE**: `user_roles` query removed from `fetchNotifications()` parallel bundle; `userRole` is now a `computed` from `useCacheUserData(userId, { includeRole: true })`. Stale `userRole.value = null` assignments in reset blocks removed. | ~~Medium~~ |

### Presence data: TeamSpeak double-fetch on the same profile

| # | Location | Issue | Priority |
|---|----------|-------|----------|
| ~~178~~ | ~~`components/Profile/Activity/ActivityTeamspeak.vue` + `components/Profile/RichPresenceTeamSpeak.vue`~~ | ~~Both components issue `select('*').from('presences_teamspeak').eq('profile_id', ...).order('updated_at', ...)` - an identical query for the same profile. `ActivityTeamspeak` fetches via a plain `fetchPresence()` function and stores the result in a local ref, then renders `<RichPresenceTeamSpeak>` passing `teamspeakIdentities` as a prop. However `RichPresenceTeamSpeak` independently runs the same query again via `useAsyncData`. The fix is to pass the already-fetched row array down as a prop (a `presences` prop already exists on `RichPresenceTeamSpeak`) and disable its internal fetch when the prop is populated, or have `ActivityTeamspeak` own the single fetch and pass all needed data down.~~ - **DONE**: `RichPresenceTeamSpeak` now accepts an optional `presences: Tables<'presences_teamspeak'>[] | null` prop; when non-null, `useAsyncData` skips its internal fetch and the computed derives from the passed rows instead. `ActivityTeamspeak` passes `:presences="loading ? null : presenceList"` and uses `Tables<'presences_teamspeak'>` directly (replacing the bespoke local interface). | ~~Medium~~ |

---

## Database: Query Efficiency, Scalability & Performance

This section covers issues found directly in the Postgres schema, trigger logic, RLS policies, and query patterns - separate from the frontend caching gaps above. Items here require migrations or schema-level changes, not just composable work.

### Missing indexes on high-traffic filter columns

The existing index pass (`20250610130000_add_foreign_key_indexes.sql`, `20251121221931_rls_initialization_plan_optimization.sql`) covered FK columns well, but several columns that appear in frequent `WHERE` / `ORDER BY` / `OR` filter chains have no index at all.

| # | Table / Column | Problem | Suggested fix | Priority |
|---|---------------|---------|---------------|----------|
| ~~179~~ | ~~`profiles.banned` + `profiles.ban_end`~~ | ~~The community index page, funding page, and admin user table all filter with `.or('banned.eq.false,ban_end.lte.<now>')`. This OR predicate is evaluated as a sequential scan because neither column is indexed. With a growing member list this will get noticeably slow.~~ | ~~Add a partial composite index: `CREATE INDEX idx_profiles_active ON profiles(created_at) WHERE banned = false AND (ban_end IS NULL OR ban_end <= now())`. For the OR pattern with a timestamp argument a functional index on `(banned, ban_end)` also works: `CREATE INDEX idx_profiles_ban ON profiles(banned, ban_end)`.~~ - **DONE**: `idx_profiles_ban ON profiles(banned, ban_end)` added in `20260315200002_add_missing_indexes.sql`. | ~~High~~ |
| ~~180~~ | ~~`profiles.supporter_lifetime`, `profiles.supporter_patreon`~~ | ~~`funding.vue` and `community/index.vue` both query `.or('supporter_lifetime.eq.true,supporter_patreon.eq.true')`. No index exists on either boolean column - Postgres full-scans `profiles` to find supporters.~~ | ~~Add a partial index covering both: `CREATE INDEX idx_profiles_supporters ON profiles(created_at ASC) WHERE supporter_lifetime = true OR supporter_patreon = true`. The predicate makes it tiny and the scan for supporters becomes an index-only scan.~~ - **DONE**: `idx_profiles_supporters ON profiles(created_at ASC) WHERE supporter_lifetime = true OR supporter_patreon = true` added in `20260315200002_add_missing_indexes.sql`. | ~~High~~ |
| ~~181~~ | ~~`discussions.is_draft`~~ | ~~`forum/index.vue`, `forum/index.vue` draft count query, and the `.neq('discussions.is_draft', true)` nested filter on the `discussion_topics` join all filter on `is_draft`. There is no index on this column. The topic tree fetch pulls ALL discussions server-side and relies on PostgREST filtering; with a large forum this grows unbounded.~~ | ~~`CREATE INDEX idx_discussions_is_draft ON discussions(is_draft) WHERE is_draft = true` (partial, tiny) plus a broader composite: `CREATE INDEX idx_discussions_topic_draft ON discussions(discussion_topic_id, is_draft, last_activity_at DESC)` to cover the join + filter + sort in one index.~~ - **DONE**: both `idx_discussions_is_draft` and `idx_discussions_topic_draft` added in `20260315200002_add_missing_indexes.sql`. | ~~High~~ |
| ~~182~~ | ~~`discussion_replies.is_deleted`~~ | ~~`forum_discussion_replies` view and several reply fetches filter `.eq('is_deleted', false)`. No index on `is_deleted` exists - every reply SELECT scans the full table and discards soft-deleted rows post-scan.~~ | ~~`CREATE INDEX idx_discussion_replies_not_deleted ON discussion_replies(discussion_id, created_at DESC) WHERE is_deleted = false`. This also covers the `discussion_id` + `created_at` sort that appears in the `last_activity_at` trigger's `MAX(r.created_at)` subquery.~~ - **DONE**: `idx_discussion_replies_not_deleted` added in `20260315200002_add_missing_indexes.sql`. | ~~High~~ |
| ~~183~~ | ~~`notifications.is_read`~~ | ~~Notification badge counts query unread notifications. The existing partial index `notifications_user_id_unread_idx ON notifications(user_id) WHERE is_read = false` is correct, but the `markDiscussionSeen` path does `.eq('is_read', false)` as an additional filter on top of `user_id + source + source_id` - that triple-column lookup hits `notifications_user_source_unique_idx` which does not include `is_read`, causing a filter step.~~ | ~~Add `is_read` into the unique partial index or add a separate covering index: `CREATE INDEX idx_notifications_user_source ON notifications(user_id, source, source_id) WHERE is_read = false`.~~ - **DONE**: `idx_notifications_user_source` added in `20260315200002_add_missing_indexes.sql`. | ~~Medium~~ |
| ~~184~~ | ~~`expenses.ended_at`~~ | ~~`funding.vue` filters active expenses client-side after fetching all rows: `.filter(expense => !expense.ended_at)`. The DB-level equivalent `WHERE ended_at IS NULL` has no index.~~ | ~~`CREATE INDEX idx_expenses_active ON expenses(started_at DESC) WHERE ended_at IS NULL`. Push the active-only filter to the query itself (`.is('ended_at', null)`) to avoid sending all ended expenses over the wire.~~ - **DONE**: `idx_expenses_active` added in `20260315200002_add_missing_indexes.sql`. | ~~Medium~~ |
| ~~185~~ | ~~`events.date`~~ | ~~`events/index.vue` and `pages/index.vue` both `ORDER BY date ASC`. The `events` table has no index on `date`.~~ | ~~`CREATE INDEX idx_events_date ON events(date ASC)`. For the landing page upcoming-events query add `.gte('date', today)` so only future events are scanned (requires the index).~~ - **DONE**: `idx_events_date` added in `20260315200002_add_missing_indexes.sql`. | ~~Medium~~ |
| ~~186~~ | ~~`referendums.date_start` + `date_end`~~ | ~~`20251120000816_referendum_start_date_gating.sql` added a check function `event_rsvp_window_open` that queries `referendums` by `id` then compares timestamps in PL/pgSQL. The `date_start` / `date_end` filter path is unindexed. Any referendum listing that filters by open/active status will full-scan.~~ | ~~`CREATE INDEX idx_referendums_dates ON referendums(date_start, date_end)`.~~ - **DONE**: `idx_referendums_dates` added in `20260315200002_add_missing_indexes.sql`. | ~~Low~~ |

### `authorize()` called multiple times per RLS policy evaluation

The `authorize()` function (rewritten in `20251121221931_rls_initialization_plan_optimization.sql`) caches `auth.uid()` with `(SELECT auth.uid())` to avoid repeated evaluations. However, several tables have **multiple separate policies** that each call `authorize()` independently - once for SELECT, once for INSERT, once for UPDATE, etc. - meaning the `user_roles` table lookup fires once per policy per statement.

The standard fix for this in Postgres RLS is to use a single `SECURITY DEFINER` helper function that stores the role in a session-local GUC (`current_setting`) so subsequent calls within the same transaction are free. A lightweight version:

```sql
-- supabase/migrations/<timestamp>_cache_user_role_in_guc.sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  cached text;
  role   public.app_role;
BEGIN
  BEGIN
    cached := current_setting('app.user_role_cache');
    IF cached IS NOT NULL AND cached <> '' THEN
      RETURN cached::public.app_role;
    END IF;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  SELECT ur.role INTO role FROM public.user_roles ur
  WHERE ur.user_id = (SELECT auth.uid()) LIMIT 1;

  PERFORM set_config('app.user_role_cache', COALESCE(role::text, ''), true);
  RETURN role;
END;
$$;
```

Policies would then call `current_user_role()` instead of querying `user_roles` directly inside `authorize()`. This eliminates the repeated lookup cost on tables like `discussions`, `discussion_replies`, and `discussion_topics` where 4-6 separate policies all call `authorize()`.

| # | Affected tables | Priority |
|---|----------------|----------|
| ~~187~~ | ~~`discussions`, `discussion_replies`, `discussion_topics`, `alerts`, `complaints`, `motds`, `kvstore`, `role_permissions` - any table with multiple `authorize()`-gated policies~~ | ~~Medium~~ |

**DONE**: `current_user_role()` GUC-cache function created in `20260315225000_cache_user_role_in_guc.sql`. `authorize()` rewritten to call `current_user_role()` internally, so all existing policies gain the cache benefit without individual rewrites. Role resolved once per transaction, subsequent calls return from `app.user_role_cache` GUC (transaction-local, resets on commit).

### Reactions JSONB - linear fan-out on popular discussions

The `toggle_reaction` RPC stores user IDs in an array inside JSONB: `{ "hivecom": { "👍": ["<uuid>", ...] } }`. The toggle logic does a full `jsonb_array_elements` scan to check membership and another to remove the user, making it **O(n) per reaction toggle** in the number of users who have reacted. On a popular post with hundreds of reactions per emote this becomes slow, and the entire JSONB blob is re-serialized and written back on every toggle.

Additionally, there is no cap on how large these arrays can grow - a single row's `reactions` column could grow to megabytes on viral posts.

| # | Location | Issue | Suggested fix | Priority |
|---|----------|-------|---------------|----------|
| 188 | `toggle_reaction()` RPC + `reactions` column on `discussions` / `discussion_replies` | O(n) membership check + O(n) remove; unbounded array size; entire JSONB blob locked and rewritten per toggle | For long-term scalability: normalize reactions into a `discussion_reactions` table `(discussion_id, reply_id, user_id, provider, emote)` with a unique constraint. Aggregates become a `GROUP BY` + `COUNT`. For a lighter migration: add a `CHECK` that caps the total size of `reactions` using `pg_column_size(reactions) < 65536`, and add an index on `reactions` using `jsonb_path_ops` rather than the default `jsonb_ops` GIN (it is faster for containment queries but the current GIN index uses the default operator class). | Medium |

### `notify_discussion_subscribers()` - row-by-row fan-out cursor

The `notify_discussion_subscribers()` trigger function uses a `FOR v_sub IN SELECT ... LOOP` to insert one notification per subscriber. This is a PL/pgSQL cursor loop - Postgres executes one INSERT per iteration. For a discussion with many subscribers this means N round-trips inside the trigger, blocking the original reply INSERT for the entire duration.

| # | Location | Issue | Suggested fix | Priority |
|---|----------|-------|---------------|----------|
| ~~189~~ | ~~`supabase/migrations/20260308224800_notification_source_and_discussion_fanout.sql`~~ | ~~Cursor loop fires N INSERTs synchronously inside the reply INSERT trigger; blocks the writer and scales O(n) with subscriber count~~ | ~~Replace the `FOR...LOOP` with a single set-based `INSERT ... ON CONFLICT ... DO UPDATE` using a `SELECT` from `discussion_subscriptions` as the source.~~ - **DONE**: cursor loop replaced with `INSERT INTO notifications (...) SELECT ..., ds.user_id FROM discussion_subscriptions ds WHERE ds.discussion_id = NEW.discussion_id AND ds.user_id IS DISTINCT FROM NEW.created_by ON CONFLICT ... DO UPDATE SET ...` in `20260315225001_notify_discussion_subscribers_set_based.sql`. N round-trips reduced to 1 statement. | ~~High~~ |

### `update_topic_aggregate_counts()` - repeated full recomputes

The `update_topic_aggregate_counts()` trigger does `SELECT SUM(reply_count)` + `SELECT SUM(view_count)` across all discussions in a topic for DELETE and re-parent cases. On an active topic with hundreds of discussions this is a full aggregate scan on every reply deletion or discussion move.

| # | Location | Issue | Suggested fix | Priority |
|---|----------|-------|---------------|----------|
| ~~190~~ | ~~`supabase/migrations/20260303062113_discussion_topic_aggregate_counts.sql`~~ | ~~Full `SUM()` recompute for DELETE/re-parent paths; fires two subqueries against `discussions` per trigger invocation~~ | ~~The DELETE path can use a delta approach.~~ - **DONE**: DELETE path now uses `GREATEST(total_reply_count - OLD.reply_count, 0)` / `GREATEST(total_view_count - OLD.view_count, 0)` incremental delta in `20260315225002_topic_aggregate_delta_delete.sql`. Draft deletions skip the update entirely (drafts never contributed). Re-parent and draft-toggle UPDATE paths remain full recomputes (low frequency, correctness matters). | ~~Medium~~ |

### `search_profiles()` - returns full profile rows

The `search_profiles()` fuzzy-search RPC (added in `20260218145920_add_fuzzy_search.sql`) is declared as `RETURNS SETOF public.profiles`, meaning it always materializes and transfers the **entire profile row** (30+ columns including `markdown`, `teamspeak_identities`, `badges`, etc.) for every match, even though callers typically only need `id` and `username` for autocomplete.

| # | Function | Issue | Suggested fix | Priority |
|---|----------|-------|---------------|----------|
| ~~191~~ | ~~`public.search_profiles(text)`~~ | ~~Transfers full `profiles` row (including large text columns like `markdown`) for a search that only needs `id` + `username`~~ | ~~Change the return type to a lightweight composite or `TABLE(id uuid, username text, ...whatever callers need)`.~~ - **DONE**: return type changed from `SETOF public.profiles` to `TABLE(id uuid, username text)` in `20260315225003_search_profiles_slim_return.sql`. Existing caller in `mentions.ts` already projected `.select('username, id')` so no call-site changes needed. | ~~Medium~~ |

### `settings` table - overly broad grants to `anon`

The `settings` table (`20260305051751_create_settings_table.sql`) grants `DELETE`, `INSERT`, `UPDATE`, `SELECT`, `TRIGGER`, `TRUNCATE`, and `REFERENCES` to the `anon` role. RLS is enabled, and all policies are `TO authenticated` only, so anonymous users can never actually read or write rows - but granting `DELETE` and `TRUNCATE` to `anon` at the object level is unnecessarily permissive and will show up in any security audit.

| # | Table | Issue | Suggested fix | Priority |
|---|-------|-------|---------------|----------|
| ~~192~~ | ~~`public.settings`~~ | ~~`anon` role granted all DML privileges including `DELETE` and `TRUNCATE`; RLS saves it in practice but the grant is incorrect~~ | ~~`REVOKE ALL ON public.settings FROM anon; GRANT SELECT ON public.settings TO anon;` (anon can't read rows due to RLS but the grant level is conventional).~~ - **DONE**: all DML privileges except `SELECT` revoked from `anon` in migration `20260315200000_fix_settings_anon_grants.sql`. | ~~Low~~ |

### `update_user_last_seen` - no rate limiting at the DB level

The `update_user_last_seen(user_id)` RPC updates `profiles.last_seen` on every call. It is presumably called by the frontend on page load / navigation. There is no debounce or minimum-interval guard at the database level, so a client that navigates rapidly (or sends repeated requests) will fire one `UPDATE` per call against the `profiles` primary key - a hot row update under MVCC, generating dead tuple churn.

| # | Function | Issue | Suggested fix | Priority |
|---|----------|-------|---------------|----------|
| ~~193~~ | ~~`public.update_user_last_seen()`~~ | ~~Unconditional `UPDATE profiles SET last_seen = now()` on every invocation; no minimum update interval~~ | ~~Add a guard: `WHERE id = user_id AND (last_seen IS NULL OR last_seen < now() - INTERVAL '60 seconds')`. The UPDATE becomes a no-op if called within 60 s of the last update. One index on `profiles(id, last_seen)` already exists (PK); the added predicate uses it.~~ - **DONE**: function recreated with 60-second guard in `WHERE` clause. Migration `20260315200001_rate_limit_update_user_last_seen.sql`. | ~~Medium~~ |

### Missing `NOT NULL` on nullable FK columns used as required fields

Several columns are declared nullable (`NULL`) in the schema but are treated as required by application logic and have constraints that make a `NULL` insert impossible in practice. Making them `NOT NULL` enables the query planner to generate better plans (eliminates null checks in join conditions) and prevents silent data corruption if a trigger or service-role bypass accidentally inserts a null.

| # | Table / Column | Issue | Priority |
|---|---------------|-------|----------|
| 194 | `discussion_replies.discussion_id` | Declared `NOT NULL` already - correct. Listed here as a positive example. | - |
| 195 | `discussions.created_by` | Nullable but set to `auth.uid()` by default and enforced by all INSERT policies with `auth.uid() = created_by`. A `NOT NULL` constraint would allow the planner to skip null checks on the FK join to `profiles`. | Low |
| 196 | `discussion_replies.created_by` | Same as above - nullable but effectively required by all write paths. | Low |
| 197 | `events_rsvps.created_by` | Nullable FK to `profiles`; `user_id` (the actual RSVP owner) is `NOT NULL`, making `created_by` redundant as a nullable shadow. | Low |

**WITHDRAWN** (#195-197): All three columns have `ON DELETE SET NULL` on their FK to `profiles`/`auth.users`. Profile deletion intentionally nulls these columns to preserve content as authorless records - that is an active, legitimate code path. `NOT NULL` is directly incompatible with `ON DELETE SET NULL`; Postgres would reject the profile delete rather than null the column. Migration `20260315225004_not_null_required_fks.sql` is now a no-op. If authorless records should be prevented, the FK would need to change to `ON DELETE CASCADE` or `ON DELETE RESTRICT` first - that is a product decision.

### `forum_discussion_replies` view - implicit JOIN on every reply fetch

The `forum_discussion_replies` view adds an `INNER JOIN discussions ON discussions.id = dr.discussion_id WHERE discussions.discussion_topic_id IS NOT NULL`. Every query against this view (including the 20-reply activity feed on `forum/index.vue`) incurs this join even when the caller doesn't need `discussions` columns at all. The join is well-indexed (`discussion_replies_discussion_id_idx` + `discussions` PK) so it's not catastrophic, but it adds overhead on every forum page load.

| # | View | Issue | Suggested fix | Priority |
|---|------|-------|---------------|----------|
| ~~198~~ | ~~`public.forum_discussion_replies`~~ | ~~Adds an implicit `JOIN discussions` on every SELECT, even column-only queries that just need reply fields~~ | ~~Add an `is_forum_reply boolean` denormalized column to `discussion_replies` maintained by trigger.~~ - **DONE**: `is_forum_reply boolean NOT NULL DEFAULT false` added to `discussion_replies` in `20260315225005_forum_discussion_replies_denorm.sql`. Backfilled via JOIN. `set_reply_is_forum_reply()` BEFORE INSERT trigger sets the flag on new replies. `sync_replies_is_forum_reply()` AFTER UPDATE trigger propagates changes when a discussion is re-parented. View recreated as `WHERE is_forum_reply = true` - no JOIN. Partial index `idx_discussion_replies_is_forum_reply ON discussion_replies(created_at DESC) WHERE is_forum_reply = true` added. | ~~Low~~ |
