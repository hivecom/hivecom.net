<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { ProfileFriendshipStatus } from '@/types/profile.ts'
import { Avatar, Badge, Button, Card, CopyClipboard, Flex, Grid, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUser } from '@/composables/useDataUser'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCountryInfo } from '@/lib/utils/country'
import { isBirthdayDateToday } from '@/lib/utils/date'
import MDRenderer from '../Shared/MDRenderer.vue'

interface Props {
  profile?: Tables<'profiles'>
  loading?: boolean
  isOwnProfile: boolean
  friendshipStatus: ProfileFriendshipStatus
  isLoggedIn?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  isLoggedIn: false,
})

const emit = defineEmits<{
  openEditSheet: []
  openComplaintModal: []
}>()

const BIRTHDAY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const profileUserId = computed(() => props.profile?.id ?? null)
const { user } = useDataUser(profileUserId, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 60 * 60 * 1000,
})

const avatarUrl = computed(() => user.value?.avatarUrl ?? null)
const userRole = computed(() => user.value?.role ?? null)

const isTablet = useBreakpoint('<m')

const activityStatus = computed(() => {
  if (!props.profile?.last_seen)
    return null

  return getUserActivityStatus(props.profile.last_seen)
})

const countryInfo = computed(() => getCountryInfo(props.profile?.country ?? null))
// Treat YYYY-MM-DD birthdays as date-only values so timezone offsets do not shift the day
function parseBirthdayDate(value: string | null): Date | null {
  if (!value)
    return null

  const dateOnlyMatch = value.match(BIRTHDAY_DATE_RE)
  if (dateOnlyMatch) {
    const [, yearStr, monthStr, dayStr] = dateOnlyMatch
    const year = Number(yearStr)
    const month = Number(monthStr) - 1
    const day = Number(dayStr)

    const date = new Date(year, month, day)
    if (!Number.isNaN(date.getTime()))
      return date
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const birthdayInfo = computed(() => {
  if (!props.profile?.birthday)
    return null

  const parsed = parseBirthdayDate(props.profile.birthday)
  if (!parsed)
    return null

  const today = new Date()
  const birthdayIsToday = isBirthdayDateToday(props.profile.birthday)
  const isBornThisYear = parsed.getFullYear() === today.getFullYear()
  let age = today.getFullYear() - parsed.getFullYear()
  const hasHadBirthdayThisYear
    = today.getMonth() > parsed.getMonth()
      || (today.getMonth() === parsed.getMonth() && today.getDate() >= parsed.getDate())

  if (!hasHadBirthdayThisYear)
    age -= 1

  if (age < 0)
    age = 0

  return {
    formatted: parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    age,
    isToday: birthdayIsToday,
    isBornThisYear,
  }
})

const isBirthdayToday = computed(() => birthdayInfo.value?.isToday ?? false)

const birthdayTooltipText = computed(() => {
  if (!birthdayInfo.value)
    return ''

  if (birthdayInfo.value.isToday) {
    if (birthdayInfo.value.isBornThisYear)
      return 'Happy birth?'
    if (birthdayInfo.value.age < 6)
      return 'Happy Birthday?'
    return 'Happy birthday!'
  }

  const ageText = `${birthdayInfo.value.age} year${birthdayInfo.value.age === 1 ? '' : 's'} old`
  if (birthdayInfo.value.age < 6) {
    return `${ageText} · Suspiciously young`
  }

  return ageText
})

const joinedTooltip = computed(() => {
  if (!props.profile?.created_at)
    return ''

  const created = new Date(props.profile.created_at)
  if (Number.isNaN(created.getTime()))
    return ''

  return created.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

// Generate profile URL for copying
const profileUrl = computed(() => {
  if (typeof window === 'undefined')
    return ''
  const identifier = props.profile?.username || props.profile?.id
  return `${window.location.origin}/profile/${identifier}`
})

// Get user initials for avatar
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Format time since account creation
function getAccountAge(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - created.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }
  else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  else {
    const years = Math.floor(diffDays / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
  }
}

// Get role display and styling
function getRoleInfo(role: string | null) {
  if (!role)
    return null

  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1)
  let variant: 'info' | 'success' | 'danger'

  switch (role) {
    case 'admin':
      variant = 'danger'
      break
    case 'moderator':
      variant = 'info'
      break
    default:
      variant = 'success'
  }

  return { display: roleDisplay, variant }
}

const showAvatarLightbox = ref(false)

// --- Birthday Confetti ---
const wrapperRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

interface ConfettiParticle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  shape: 'rect' | 'circle' | 'diamond'
  opacity: number
  frameDelay: number
}

const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8', '#f783ac']
const PARTICLE_COUNT = 60

let confettiParticles: ConfettiParticle[] = []
let animFrameId: number | null = null
let confettiResizeObserver: ResizeObserver | null = null
let mouseX = -9999
let mouseY = -9999

function makeConfettiParticle(w: number, h: number, initialDelay = true): ConfettiParticle {
  const shapes: ConfettiParticle['shape'][] = ['rect', 'circle', 'diamond']
  return {
    x: Math.random() * w,
    y: -Math.random() * 20 - 10,
    vx: (Math.random() - 0.5) * 2,
    vy: Math.random() * 1.5 + 0.5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? '#ff6b6b',
    size: Math.random() * 8 + 4,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.08,
    shape: shapes[Math.floor(Math.random() * shapes.length)] ?? 'rect',
    opacity: Math.random() * 0.4 + 0.6,
    frameDelay: initialDelay ? Math.floor(Math.random() * 480) : 0,
  }
}

function drawConfettiParticle(ctx: CanvasRenderingContext2D, p: ConfettiParticle) {
  ctx.save()
  ctx.globalAlpha = p.opacity
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rotation)
  ctx.fillStyle = p.color
  switch (p.shape) {
    case 'rect':
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      break
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'diamond':
      ctx.beginPath()
      ctx.moveTo(0, -p.size / 2)
      ctx.lineTo(p.size / 3, 0)
      ctx.lineTo(0, p.size / 2)
      ctx.lineTo(-p.size / 3, 0)
      ctx.closePath()
      ctx.fill()
      break
  }
  ctx.restore()
}

function runConfettiFrame() {
  const canvas = canvasRef.value
  if (!canvas)
    return

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  const REPEL_RADIUS = 100
  const REPEL_STRENGTH = 2.5

  for (const p of confettiParticles) {
    if (p.frameDelay > 0) {
      p.frameDelay--
      continue
    }

    const dx = p.x - mouseX
    const dy = p.y - mouseY
    const distSq = dx * dx + dy * dy

    if (distSq < REPEL_RADIUS * REPEL_RADIUS && distSq > 0) {
      const dist = Math.sqrt(distSq)
      const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_STRENGTH
      p.vx += (dx / dist) * force
      p.vy += (dy / dist) * force
    }

    p.vy += 0.04
    p.vx *= 0.98
    p.vy *= 0.98

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    if (speed > 7) {
      p.vx = (p.vx / speed) * 7
      p.vy = (p.vy / speed) * 7
    }

    p.x += p.vx
    p.y += p.vy
    p.rotation += p.rotationSpeed

    if (p.y > height + p.size) {
      if (Math.random() < 0.5) {
        p.opacity = 0
        continue
      }
      const recycled = makeConfettiParticle(width, height, false)
      p.x = recycled.x
      p.y = recycled.y
      p.vx = recycled.vx
      p.vy = recycled.vy
      p.frameDelay = 0
    }
    if (p.x < -p.size)
      p.x = width + p.size
    else if (p.x > width + p.size)
      p.x = -p.size

    drawConfettiParticle(ctx, p)
  }

  confettiParticles = confettiParticles.filter(p => p.opacity > 0)
  animFrameId = requestAnimationFrame(runConfettiFrame)
}

function startConfetti() {
  const canvas = canvasRef.value
  const wrapper = wrapperRef.value
  if (!canvas || !wrapper)
    return

  const w = wrapper.offsetWidth
  const h = wrapper.offsetHeight
  canvas.width = w
  canvas.height = h

  confettiParticles = []
  for (let i = 0; i < PARTICLE_COUNT; i++)
    confettiParticles.push(makeConfettiParticle(w, h))

  if (animFrameId !== null)
    cancelAnimationFrame(animFrameId)
  runConfettiFrame()

  confettiResizeObserver = new ResizeObserver(() => {
    if (canvas && wrapper) {
      canvas.width = wrapper.offsetWidth
      canvas.height = wrapper.offsetHeight
    }
  })
  confettiResizeObserver.observe(wrapper)
}

function stopConfetti() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  confettiResizeObserver?.disconnect()
  confettiResizeObserver = null
  confettiParticles = []
}

function onCardMouseMove(event: MouseEvent) {
  if (!isBirthdayToday.value)
    return
  const wrapper = wrapperRef.value
  if (!wrapper)
    return
  const rect = wrapper.getBoundingClientRect()
  mouseX = event.clientX - rect.left
  mouseY = event.clientY - rect.top
}

function onCardMouseLeave() {
  mouseX = -9999
  mouseY = -9999
}

onMounted(() => {
  if (isBirthdayToday.value)
    nextTick(() => startConfetti())
})

onUnmounted(() => stopConfetti())
</script>

<template>
  <div
    ref="wrapperRef"
    class="birthday-confetti-wrapper"
    @mousemove="onCardMouseMove"
    @mouseleave="onCardMouseLeave"
  >
    <canvas v-if="isBirthdayToday" ref="canvasRef" class="birthday-confetti-canvas" />
    <Card class="profile-header card-bg" :footer-separator="loading || !!(profile?.markdown || isOwnProfile)">
      <!-- Loading Skeleton -->
      <template v-if="loading">
        <Flex gap="xl" expand y-start class="profile-header-skeleton__grid">
          <div class="profile-header-skeleton__avatar">
            <Skeleton width="164px" height="164px" style="border-radius: 50%;" />
          </div>

          <Flex column gap="s" expand>
            <Flex gap="xs" y-center>
              <Skeleton height="1.5rem" width="4rem" style="border-radius: 1rem;" />
              <Skeleton height="1.5rem" width="5.5rem" style="border-radius: 1rem;" />
            </Flex>
            <Skeleton height="48px" class="profile-header-skeleton__username" />
            <Skeleton height="1.4rem" width="70%" />
            <Flex gap="m" y-center wrap class="profile-header-skeleton__meta">
              <Skeleton height="1rem" width="6rem" />
              <Skeleton height="1rem" width="8rem" />
              <Skeleton height="1rem" width="7rem" />
            </Flex>
          </Flex>
        </Flex>
      </template>

      <Flex v-else-if="profile" column y-center x-center>
        <Grid gap="xl" expand columns="auto 1fr" class="profile-header-grid">
          <!-- Avatar -->
          <div class="profile-avatar">
            <div class="avatar-container">
              <Avatar :size="164" :url="avatarUrl || undefined" @click="avatarUrl && (showAvatarLightbox = true)">
                <template v-if="!avatarUrl" #default>
                  {{ getUserInitials(profile.username) }}
                </template>
              </Avatar>
              <!-- Activity status indicator -->
              <Tooltip v-if="activityStatus">
                <template #tooltip>
                  <p>{{ activityStatus.lastSeenText }}</p>
                </template>
                <div
                  class="profile__online-indicator"
                  :class="{ active: activityStatus.isActive }"
                />
              </Tooltip>
            </div>
          </div>

          <Modal v-if="avatarUrl" size="l" :open="showAvatarLightbox" @close="showAvatarLightbox = false">
            <template #header>
              <h4>{{ profile.username }}'s avatar</h4>
            </template>
            <img :src="avatarUrl" class="avatar-lightbox">
          </Modal>

          <Flex column gap="s" expand x-end class="h-100">
            <!-- Username, Role, Badges and Action Buttons Row -->
            <Flex gap="xs" y-center wrap>
              <Badge
                v-if="userRole && getRoleInfo(userRole)"
                :variant="getRoleInfo(userRole)?.variant"
                size="s"
              >
                {{ getRoleInfo(userRole)?.display }}
              </Badge>
              <Badge v-if="profile.supporter_patreon || profile.supporter_lifetime" variant="warning" size="s">
                <Icon name="ph:heart" class="gold" />
                Supporter
              </Badge>
              <!-- Friend status badge -->
              <Badge
                v-if="!isOwnProfile && friendshipStatus === 'mutual'"
                variant="success"
                size="s"
              >
                <Icon name="ph:user-check" />
                Friends
              </Badge>
              <Badge
                v-else-if="!isOwnProfile && friendshipStatus === 'sent_request'"
                variant="info"
                size="s"
              >
                <Icon name="ph:clock" />
                Request Sent
              </Badge>
              <Badge
                v-else-if="!isOwnProfile && friendshipStatus === 'received_request'"
                variant="accent"
                size="s"
              >
                <Icon name="ph:bell" />
                Friend Request
              </Badge>
            </Flex>

            <Flex y-center :column="isTablet">
              <h1 class="profile-title">
                {{ profile.username }}
              </h1>
            </Flex>

            <!-- Action Buttons -->
            <Flex gap="xs" class="profile-action-buttons">
              <Tooltip v-if="isOwnProfile">
                <Button size="s" variant="gray" square @click="emit('openEditSheet')">
                  <Icon name="ph:pencil" />
                </Button>
                <template #tooltip>
                  <p>Edit profile</p>
                </template>
              </Tooltip>
              <Tooltip v-else-if="props.isLoggedIn">
                <Button size="s" square variant="gray" @click="emit('openComplaintModal')">
                  <Icon name="ph:flag" />
                </Button>
                <template #tooltip>
                  <p>Report this profile</p>
                </template>
              </Tooltip>
              <CopyClipboard :text="profileUrl" confirm>
                <Tooltip>
                  <Button size="s" variant="gray" square>
                    <Icon name="ph:link" />
                  </Button>
                  <template #tooltip>
                    <p>Copy link to profile</p>
                  </template>
                </Tooltip>
              </CopyClipboard>
            </Flex>

            <!-- Introduction (Full Width) -->
            <p v-if="profile.introduction" class="profile-description">
              {{ profile.introduction }}
            </p>

            <!-- Account Info (Full Width) -->
            <Flex x-between y-center class="profile-meta" expand>
              <Flex gap="m" y-center wrap>
                <Flex v-if="countryInfo" gap="xs" y-center class="profile-country">
                  <span
                    class="country-emoji"
                    role="img"
                    :aria-label="countryInfo.name"
                  >
                    {{ countryInfo.emoji }}
                  </span>
                  <span class="text-color-lighter text-s">
                    {{ countryInfo.name }}
                  </span>
                </Flex>

                <Tooltip v-if="birthdayInfo">
                  <template #tooltip>
                    <span>{{ birthdayTooltipText }}</span>
                  </template>
                  <Flex gap="xs" y-center>
                    <Icon
                      class="text-color-lighter"
                      :class="{ 'shiny-icon': isBirthdayToday }"
                      name="ph:cake"
                      size="16"
                    />
                    <span
                      class="text-s text-color-lighter"
                      :class="{ 'shiny-text': isBirthdayToday }"
                    >
                      {{ birthdayInfo.formatted }}
                    </span>
                  </Flex>
                </Tooltip>

                <Flex v-if="profile.website" gap="xs" y-center>
                  <Icon class="text-color-lighter" name="ph:link" size="16" />
                  <a
                    :href="profile.website"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="website-link text-s"
                  >
                    {{ profile.website }}
                  </a>
                </Flex>

                <Tooltip v-if="profile.created_at">
                  <template #tooltip>
                    <span>Joined {{ joinedTooltip || profile.created_at }}</span>
                  </template>
                  <Flex gap="xs" y-center>
                    <Icon class="text-color-lighter" name="ph:calendar" size="16" />
                    <span class="text-s text-color-lighter">
                      Joined {{ getAccountAge(profile.created_at) }}
                    </span>
                  </Flex>
                </Tooltip>
              </Flex>
            </Flex>
          </Flex>
        </Grid>
      </Flex>

      <template v-if="loading" #footer>
        <Flex column gap="m">
          <Skeleton height="1rem" width="100%" />
          <Skeleton height="1rem" width="85%" />
          <Skeleton height="1rem" width="70%" />
          <Skeleton height="1rem" width="90%" />
          <Skeleton height="1rem" width="60%" />
        </Flex>
      </template>
      <template v-else-if="profile?.markdown || isOwnProfile" #footer>
        <div v-if="profile?.markdown" class="profile-markdown">
          <MDRenderer
            skeleton-height="504px"
            :md="profile.markdown"
          />
        </div>
        <div v-else-if="isOwnProfile" class="empty-state">
          <p class="text-color-lighter text-s">
            Add content to your profile to tell others about yourself!
          </p>
        </div>
      </template>
    </Card>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.birthday-confetti-wrapper {
  position: relative;
  width: 100%;
}

.birthday-confetti-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-active);
  border-radius: var(--border-radius-m);
}

.profile__online-indicator {
  position: absolute;
  bottom: 15px;
  right: 15px;
  width: 16px;
  height: 16px;
  background-color: var(--color-text-lighter);
  border: 2px solid var(--color-bg);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--color-border);
  transition: background-color 0.2s ease;

  &.active {
    background-color: var(--color-text-green);
  }
}

.avatar-lightbox {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  border-radius: var(--border-radius-m);
}

.profile-action-buttons {
  position: absolute;
  top: 16px;
  right: 16px;
}

.profile-markdown {
  line-height: 1.6;
}

.empty-state {
  text-align: center;
  padding: var(--space-l);

  p {
    margin-bottom: var(--space-m);
  }
}

.profile-header-skeleton {
  &__grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-xl);
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__meta {
    margin-top: var(--space-m);
  }

  &__username {
    width: min(16rem, 100%);
  }
}

@media screen and (max-width: $breakpoint-m) {
  .profile-header-skeleton__grid {
    grid-template-columns: 1fr !important;
    justify-items: center;
    text-align: center;

    .vui-flex {
      justify-content: center !important;
      align-items: center !important;
    }
  }
}

.profile-header {
  .vui-badge {
    padding-inline: 8px;
    padding-block: 4px;
  }

  &:is(&.vui-card) {
    :deep(.vui-card-content),
    :deep(.vui-card-footer) {
      padding: var(--space-l);
    }
  }

  .profile-avatar {
    flex-shrink: 0;

    .avatar-container {
      position: relative;
      display: inline-block;

      .vui-avatar {
        cursor: pointer;
      }
    }
  }

  .profile-title {
    margin: 0;
    font-size: var(--font-size-xxxxl);
    color: var(--color-text);
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
    max-width: 100%;
  }

  .profile-description {
    margin: 0;
    color: var(--color-text-light);
    line-height: 1.4;
    font-size: var(--font-size-l);
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
    max-width: 100%;
  }

  .profile-meta {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    margin-top: var(--space-m);

    .website-link {
      color: var(--color-text-lighter);
      text-decoration: none;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;

      &:hover {
        text-decoration: underline;
        color: var(--color-accent);
      }
    }

    .profile-country {
      .country-emoji {
        font-size: var(--font-size-m);
        line-height: 1;
      }
    }
  }
}

@media screen and (max-width: $breakpoint-m) {
  .profile-header-grid {
    grid-template-columns: 1fr !important;
    justify-items: center;

    * {
      text-align: center;
    }

    .vui-flex {
      justify-content: center !important;
      align-items: center !important;
    }
  }
}

@media screen and (max-width: $breakpoint-xs) {
  .profile-header-grid {
    padding-top: var(--space-xxl);
  }

  .profile-title {
    font-size: var(--font-size-xxxl) !important;
  }
}
</style>
