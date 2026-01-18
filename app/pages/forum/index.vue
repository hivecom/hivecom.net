<script setup lang="ts">
import { BreadcrumbItem, Breadcrumbs, Button, Card, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import ForumListItem from '@/components/Forum/ForumListItem.vue'
import ForumModalAddPost from '@/components/Forum/ForumModalAddPost.vue'
import ForumModalAddTopic from '@/components/Forum/ForumModalAddTopic.vue'

// TODO: hook up to db

// TODO: for search, use the experimental vui Commands component (not done yet)

const addingTopic = ref(false)
const addingPost = ref(false)

const activeForumPath = computed(() => {
  return [
    { id: 0, title: 'Frontpage' },
    { id: 1, title: 'General' },
  ]
})
</script>

<template>
  <div class="page forum">
    <section class="page-title mb-xl">
      <h1>
        Forum
      </h1>
      <p>
        Bringing back the old school internet experience
      </p>
    </section>

    <Flex x-between class="mb-m">
      <Breadcrumbs>
        <BreadcrumbItem v-for="item in activeForumPath" :key="item.id">
          {{ item.title }}
        </BreadcrumbItem>
      </Breadcrumbs>

      <Flex gap="s">
        <Dropdown>
          <template #trigger="{ toggle }">
            <Button size="s" variant="accent" @click="toggle">
              <template #start>
                <Icon name="ph:plus" :size="16" />
              </template>
              Create
            </Button>
          </template>
          <DropdownItem size="s" @click="addingPost = true">
            Post
          </DropdownItem>
          <DropdownItem size="s" @click="addingTopic = true">
            Topic
          </DropdownItem>
        </Dropdown>
        <!-- TODO: I want search to be 1-level deep list of all categories & posts with a title, path (location) of the post -->
        <Button size="s">
          <template #start>
            <Icon name="ph:magnifying-glass" :size="16" />
          </template>
          Search
        </Button>
      </Flex>
    </Flex>

    <Card class="forum__category" separators>
      <div class="forum__category-title">
        <h3>About forums</h3>

        <!-- TODO: make sure only the first category should render these labels -->
        <span>Posts</span>
        <span>Replies</span>
        <span>Users</span>
        <span>Last update</span>
      </div>
      <ul>
        <ForumListItem
          pinned
          :data="{
            icon: 'ph:scroll',
            title: 'Welcome to our forum bro',
            description: 'Read about our community, what\'re making and how you can help...',
            countPosts: 12,
            countReplies: 71,
            countUsers: 24,
            lastUpdate: dayjs('2025-12-05').toString(),
          }"
        />

        <ForumListItem
          :data="{
            icon: 'ph:basket',
            title: 'Chips thread',
            description: 'Heated opinions about all the best chip flavors',
            countPosts: 2,
            countReplies: 44,
            countUsers: 12,
            lastUpdate: dayjs('2026-01-03').toString(),
          }"
        />
      </ul>
    </Card>

    <ForumModalAddTopic
      :open="addingTopic"
      @close="addingTopic = false"
    />

    <ForumModalAddPost
      :open="addingPost"
      @close="addingPost = false"
    />
  </div>
</template>

<style lang="scss">
.forum {
  &__category {
    &:not(:last-of-type) {
      margin-bottom: var(--space-xl);
    }

    .vui-card-content {
      padding: 0 !important;
    }
  }

  &__category-title,
  &__category-post a {
    display: grid;
    grid-template-columns: 40px 6fr repeat(4, 1fr);
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-s) var(--space-m);
  }

  &__category-title {
    padding-block: var(--space-s);
    align-items: center;
    border-bottom: 1px solid var(--color-border);

    h3 {
      font-size: var(--font-size-xl);
      grid-column: 1 / 3;
    }

    span {
      font-size: var(--font-size-s);
      color: var(--color-text-light);
    }
  }

  &__category-post {
    &.pinned {
      .forum__category-post--icon {
        background-color: var(--color-accent);
        border-color: var(--color-accent);

        .iconify {
          color: var(--color-text-invert);
        }
      }
    }

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }

    a {
      background-color: var(--color-bg-card);
      text-decoration: none;

      &:hover {
        background-color: var(--color-bg-raised);
      }
    }
  }

  &__category-post--icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 16px;
    border: 1px solid var(--color-border);

    .iconify {
      color: var(--color-accent);
    }
  }

  &__category-post--name {
    strong {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    p {
      color: var(--color-text-lighter);
      font-size: var(--font-size-s);
    }
  }
}
</style>
