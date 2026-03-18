This ticket is a catalogue of remaining improvement points. Each issue can be solved in a vacuum. They help with the long-term maintainability of the application without directly affecting user-facing functionality (except caching items).

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

## Dead Code / Orphaned Files

| # | File | Issue | Priority |
|---|------|--------|----------|
| 75 | `components/Shared/ErrorToast.vue` | **2 `!important`** overriding VUI toast text/font styles - small (44 lines) but the overrides suggest the VUI toast token isn't being used correctly; worth a quick audit | Low |
| 76 | `components/Admin/Funding/ExpenseForm.vue` | **2 `!important`** on `border-color` for validation state - could use a VUI form validation approach with `:deep()` instead | Low |

---

## Large Components Needing Decomposition (DRY / SRP Violations)

| # | File | Size | Issue | Priority |
|---|------|------|--------|----------|
| 77 | `pages/forum/index.vue` | **1736 lines, 31 template blocks** | Monolithic forum page: contains full topic tree logic, activity feed, recently-visited tracking, search command palette, drafts, settings persistence, and URL routing all in one file. Extract: `ForumActivityFeed`, `ForumRecentlyVisited`, `ForumTopicTree` (or reuse `ForumTopicItem` more), and move the search commands to a composable | High |
| 78 | `components/Admin/Users/UserForm.vue` | **1300 lines** | Admin user form handles avatar upload, badge editing, role assignment, permission verification, field validation (8+ computed validators), birthday picker adapter, and delete confirmation all in one component. Extract: `UserFormBadgeEditor`, `UserFormRoleSelector`, `UserFormAvatarSection`, and move validators to a composable | High |
| 79 | `components/Editor/RichTextSelectionMenu.vue` | **889 lines** | Handles color picker, font picker, size picker, link editing, table insertion, math/YouTube modal triggers, and a plain-text markdown toolbar - all in one component. Extract `EditorColorPanel`, `EditorFontPanel`, `EditorFormatMenu` | High |
| 80 | `components/Discussions/Discussion.vue` | **635 lines** | Threaded discussion viewer containing view-mode toggle (flat/threaded), vote/reaction logic, thread tree building, off-topic filtering, and inline toolbar. Some work done but still monolithic - extract `DiscussionThreadedView` and `DiscussionFlatView`, move tree-building logic to a composable `useDiscussionThread` | High |
| 81 | `components/Admin/Users/UserTable.vue` | **1016 lines** | User table with inline user-status indicator, ban badge rendering, activity status, bulk search, sort, and filter all embedded. Extract `UserTableRow`, move sort/filter state to `useUserTableFilters` composable | High |
| 82 | `components/Profile/ProfileDetail.vue` | **976 lines, 10 template blocks** | Profile page aggregates: friendship state machine (5 states), friends list, own/other-profile mode switching, avatar update, complaint modal, edit sheet, and friend request flow. Extract `ProfileFriendActions`, `ProfileEditSheet`, move friendship logic to `useFriendship` composable | High |
| 83 | `pages/forum/[id].vue` | **909 lines, 17 `v-if` branches** | Individual discussion thread page - contains: locked/deleted/banned guard states, breadcrumb logic, discussion viewer embed, RSVP, reactions, mod action bar, complaint manager, delete confirm modal. Extract `ForumTopicHeader`, `ForumTopicModActions`, move guard logic to `useForumTopicGuards` composable | High |
| 85 | `layouts/admin.vue` | **550 lines** | Conflates authorization/guard logic (fetching role + permissions, redirect on failure), desktop sidebar nav, mobile sheet nav with mini-mode, provide/inject of permissions context, and layout preference persistence. Extract `useAdminAuth` composable (the `onMounted` role check + `watch(user)` redirect), `AdminSidebarNav` component, and `AdminMobileBar` component | High |
| 87 | `components/Admin/Users/UserDetails.vue` | **735 lines** | Detail panel for a user with ban status, activity log, friendship list, profile summary, and inline ban form. Extract `UserDetailsBanPanel`, `UserDetailsProfileSummary` | Medium |
| 88 | `components/Admin/Discussions/DiscussionDetails.vue` | **683 lines** | Discussion detail panel with file attachments section, author info, moderation actions, and reply listing. Extract `DiscussionAttachments`, move moderation actions to `DiscussionModerationPanel` | Medium |
| 89 | `components/Admin/Network/ContainerTable.vue` | **719 lines** | Container management table with inline status badges, log viewer embed, action bar, and filter state. Extract `ContainerTableRow`, `ContainerStatusBadge`. Also: the per-row action loading pattern (`isActionLoading(name, action)`) is a local function here while `EventTable.vue` already gets this from `useAdminCrudTable` - migrate to the same pattern to close the duplication | Medium |
| 90 | `components/Admin/Complaints/ComplaintDetails.vue` | **583 lines** | Complaint detail panel mixing complaint metadata, thread display, and status management. Extract `ComplaintThreadPanel` | Medium |
| 91 | `components/Admin/Complaints/ComplaintList.vue` | **578 lines** | Large list with inline sort, filter, pagination, and card rendering. Extract `ComplaintListFilters` composable, use `ComplaintCard` more aggressively | Medium |
| 92 | `components/Admin/Assets/AssetManager.vue` | **840 lines, 14 template blocks** | Asset browser combining directory listing, breadcrumb navigation, upload trigger, rename/delete modals, image preview, and multi-bucket support. Extract `AssetBreadcrumbs`, `AssetGrid`, `AssetPreview` | Medium |
| 93 | `components/Editor/RichTextEditor.vue` | **1102 lines** | Editor toolbar, image upload, mention picker, math modal, YouTube modal, formatting menus, and font/size/color extension wiring all in one file. Extract `EditorToolbarRow`, `EditorAttachmentUpload`; plugins are already split into `plugins/` but the parent is still too large | Medium |
| 94 | `components/Settings/MfaCard.vue` | **791 lines** | MFA management with TOTP setup wizard (QR + secret + naming), factor list management, remove-factor confirmation, and elevated-role guard. Extract `MfaTotpSetup`, `MfaFactorList` | Medium |
| 95 | `components/Settings/ConnectTeamSpeak.vue` | **658 lines** | TeamSpeak connection wizard with 4-step flow (manage/request/confirm/success), identity list, server selector, and error handling. Extract `TeamspeakConnectionWizard`, `TeamspeakIdentityList` | Medium |
| 96 | `components/Profile/ProfileForm.vue` | **774 lines** | Profile edit form with avatar, badge selection, country picker, birthday picker, Markdown editor, link fields, and submit. Extract `ProfileFormBadgeSelect`, `ProfileFormAvatarSection` | Medium |
| 97 | `components/Events/EventsCalendar.vue` | **854 lines, 7 template blocks** | Full calendar + event detail sidebar, filtering, RSVP, countdown, and VUI `!important` overrides. Extract `EventCalendarSidebar`, `EventCalendarDayCell` | Medium |
| 98 | `components/Admin/Discussions/DiscussionTable.vue` | **636 lines** | Discussion admin table with inline topic/author display, status filters, bulk actions. Extract `DiscussionTableFilters` composable | Medium |
| 99 | `pages/auth/sign-in.vue` | **655 lines** | Sign-in page handling email/password form, MFA TOTP step, MFA list-factor step, and OAuth buttons across 11 `v-if` branches. Extract `SignInMfaStep`, `SignInOAuthButtons` | Medium |
| 100 | `components/Discussions/models/DiscussionModelComment.vue` | **493 lines** | Paired with `DiscussionModelForum.vue` (#4) but absent from original ticket. Contains vote/reaction logic, 10 flex rules, 5 `!important` overrides | Medium |
| 101 | `components/Settings/ConnectionsCard.vue` | **565 lines** | One card managing five distinct connection providers (Patreon, Steam, Discord, TeamSpeak, rich-presence toggle), each with its own disconnect handler, loading state, and inline conditional layout. Each provider is its own SRP unit - extract `ConnectionRowPatreon`, `ConnectionRowSteam`, `ConnectionRowDiscord`, `ConnectionRowTeamSpeak`, `ConnectionRowRichPresence`, all sharing a generic `ConnectionRow` wrapper slot pattern | Medium |
| 102 | `components/Events/RSVPButton.vue` | **349 lines** | Partially refactored - `useEventTiming` (the interval clock) and `useRsvpBus` (the event bus) have been extracted. Supabase RSVP calls (fetch, upsert, delete) and `rsvpStatus` state still live in the component. Extract a `useRSVP(event)` composable to complete the cleanup | Medium |
| 103 | `components/Admin/Games/GameForm.vue` | **488 lines** | Asset management (upload/remove/preview for three asset types) lives alongside the basic game fields form, coupled only by `gameForm.shorthand`. Extract `GameAssetUploadPanel` sub-component (the "Game Assets" section with `FileUpload` instances, `handleAssetUpload`, `handleAssetRemove`, Steam asset link dropdown) | Medium |
| 104 | `components/Admin/Games/GameDetails.vue` | **470 lines** | Detail sheet fetching assets (3 parallel URL lookups) and related game servers in a single `watchEffect`. Renders "Game Assets", "Related Game Servers", and metadata in one template. Extract `GameDetailsAssets` and `GameDetailsServers` sub-components | Medium |
| 107 | `components/Admin/Network/ContainerDetails.vue` | **532 lines** | Log viewer sheet embedding: ANSI-to-HTML conversion, auto-scroll logic with `requestAnimationFrame` double-set, custom date-range vs. time-period toggle, tail-line filter, and clipboard copy - all inside a details panel sheet. Extract `ContainerLogViewer` sub-component (the entire logs section: `logsContainerRef`, `autoScrollEnabled`, `handleLogsScroll`, `scrollLogsToBottom`, `formattedLogs`, time/date filter state, all related watchers) | Medium |
| 108 | `components/Admin/Projects/ProjectForm.vue` | **574 lines** | Admin project form with banner upload, game selector, metadata, and delete. Extract `ProjectFormBannerUpload` | Low |
| 110 | `pages/auth/confirm.vue` | **672 lines** | Auth confirmation page handling email confirm, password reset, and OAuth consent flows in a single file. Split into separate page components or extract `AuthConfirmPasswordReset`, `AuthConfirmEmail` | Low |
| 111 | `components/Profile/Badges/ProfileBadge.vue` | **671 lines** | Single badge display component with shiny animation, rarity tiers, tooltip, and multi-size rendering all in one. Extract `ProfileBadgeTooltip`, `ProfileBadgeShinyEffect` as sub-components | Low |
| 112 | `components/Shared/TeamSpeakViewer.vue` | **1056 lines** | Server tree viewer with channel groups, user presence, identity matching, and expand/collapse. Extract `TeamspeakChannelGroup`, `TeamspeakChannelRow`, `TeamspeakUserRow` | Low |
| 113 | `components/Forum/ForumModalAddDiscussion.vue` | **583 lines** | Discussion creation modal with topic picker, NSFW toggle, content rules gate, Markdown editor, and draft management. Extract `ForumDraftManager`, move validation to a composable | Low |
| 116 | `components/Community/ProjectCard.vue` | **411 lines** | Three distinct rendering modes (`ultraCompact`, `compact`, default) are all in one template with 3-way branching at every level. Consider extracting `ProjectCardUltraCompact` and `ProjectCardCompact` as named slots or sub-components | Low |
| 121 | `components/Shared/FileUpload.vue` | **470 lines** | Handles two fundamentally different layouts (`variant: 'asset'` vs `'avatar'`) with interleaved conditional CSS and aspect-ratio logic. Consider splitting into `FileUploadAsset.vue` and `FileUploadAvatar.vue` backed by a shared `useFileUpload` composable (drag-drop, validation, preview URL management, `processFile`, `checkImageExists`) | Low |
| 122 | `components/Admin/Events/EventForm.vue` | **509 lines** | Duration field (days/hours/minutes split + conversion to/from total minutes) and the custom Calendar date-picker wrapper are reusable patterns duplicated across forms. Extract `EventDurationInput` and `AdminDateTimePicker` as shared form sub-components | Low |
| 123 | `pages/admin/users.vue` | **475 lines** | The page does substantially more than orchestrate child components: it contains the full ban/unban/delete action pipeline (three `supabase.functions.invoke` calls), a role-update flow with permission guards (two extra Supabase calls inside `handleUserSave`), a `runActionWithDetailLoading` helper, and `refreshSignal` / `userRefreshTrigger` dual-signal plumbing. Additionally `handleUserDelete` still calls `supabase.from('profiles').delete()` directly - a different (unsafe) code path than `handleUserAction('delete')` which uses the `admin-user-delete` edge function. This dual delete path is the most urgent fix here. Extract `useAdminUserActions(config)` composable for the action pipeline and unify the two delete paths. | High |

---

## Composable Design & Consistency Issues

| # | File(s) | Issue | Priority |
|---|---------|-------|----------|
| 154 | `composables/useCacheGameAssets.ts` | **localStorage used directly** - this composable is the only cache composable that bypasses `useCache` and writes to `window.localStorage` directly with hand-rolled JSON serialization, TTL checking, and `try/catch` suppression. All other asset/data composables use the `useCache` in-memory store. The inconsistency means game asset cache entries survive page reloads (possibly desirable) but are invisible to `cache.invalidateByPattern` and `cache.clearCache`, and are never cleaned up by the shared TTL sweep. The localStorage approach is intentional - game asset URLs are CDN paths that are worth caching across hard reloads (in-memory `useCache` is cleared on reload). The rationale and tradeoffs are documented in the composable's JSDoc. If cross-reload persistence becomes a common need, extract a `usePersistentCache` composable and adopt it here. | Medium |
| 155 | `composables/useCache.ts`, `ActivitySteam.vue`, `ActivityTeamspeak.vue`, `useRealtimeReferendumVotes.ts` | **`useCacheQuery` stale comments** - migration to `useCachedFetch` is complete; all former call sites have been updated. Three stale comments referencing `useCacheQuery` remain in `ActivitySteam.vue`, `ActivityTeamspeak.vue`, and the JSDoc of `useRealtimeReferendumVotes.ts`. Clean those up and close this item. | Low |
| 156 | `composables/useAdminPermissions.ts` | **Convenience computed explosion** - the composable exposes 30+ pre-computed booleans (`canManageUsers`, `canViewUsers`, `canModifyUsers`, `canDeleteUsers`, `canManageEvents`, ...). Most are used in only one or two components. The `hasPermission` and `hasAnyPermission` functions are already returned and cover all cases dynamically. The pre-computed properties add maintenance burden every time a new resource type is added. Consider removing all the named computeds and letting callers use the raw helpers. | Low |
