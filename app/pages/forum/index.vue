<script setup lang="ts">
import { BreadcrumbItem, Breadcrumbs, Card } from '@dolanske/vui'

// TODO: forum frontpage
</script>

<template>
  <div class="page forum">
    <section class="page-title mb-xl">
      <h1>
        Forum
      </h1>
      <p>
        We discuss that shit up
      </p>
    </section>

    <Breadcrumbs class="mb-m">
      <BreadcrumbItem href="#">
        Frontpage
      </BreadcrumbItem>
      <BreadcrumbItem href="#">
        Sub category
      </BreadcrumbItem>
      <BreadcrumbItem>Post title</BreadcrumbItem>
    </Breadcrumbs>

    <Card class="forum__category" separators>
      <div class="forum__category-title">
        <h3>About forums</h3>
        <span>Categories</span>
        <span>Posts</span>
        <span>Last update</span>
      </div>
      <ul>
        <li class="forum__category-post">
          <!-- TODO: replace with nuxt link -->
          <a href="#">
            <div class="forum__category-post--icon">
              <Icon name="ph:scroll" :size="20" />
            </div>
            <div class="forum__category-post--name">
              <strong>Welcome to our forum bro</strong>
              <p>Read about our community, what're making and how you can help...</p>
            </div>

            <div class="forum__category-post--meta">
              <span>6</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2 minutes ago</span>
            </div>

          </a>
        </li>
        <li class="forum__category-post">
          <!-- TODO: replace with nuxt link -->
          <a href="#">
            <div class="forum__category-post--icon">
              <Icon name="ph:scroll" :size="20" />
            </div>
            <div class="forum__category-post--name">
              <strong>Introductions</strong>
              <p>First time joining? Tell us about yourself!</p>
            </div>

            <div class="forum__category-post--meta">
              <span>6</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2 minutes ago</span>
            </div>

          </a>
        </li>
      </ul>
    </Card>

    <Card class="forum__category" separators>
      <div class="forum__category-title">
        <h3>About forums</h3>
      </div>
      <ul>
        <li class="forum__category-post">
          <!-- TODO: replace with nuxt link -->
          <a href="#">
            <div class="forum__category-post--icon">
              <Icon name="ph:scroll" :size="20" />
            </div>
            <div class="forum__category-post--name">
              <strong>Welcome to our forum bro</strong>
              <p>Read about our community, what're making and how you can help...</p>
            </div>

            <div class="forum__category-post--meta">
              <span>6</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2</span>
            </div>
            <div class="forum__category-post--meta">
              <span>2 minutes ago</span>
            </div>

          </a>
        </li>
      </ul>
    </Card>
  </div>
</template>

<style lang="scss" scoped>
.forum {
  &__category {
    &:not(:last-of-type) {
      margin-bottom: var(--space-xl);
    }

    :deep(.vui-card-content) {
      padding: 0 !important;
    }
  }

  &__category-title,
  &__category-post a {
    display: grid;
    grid-template-columns: 40px 5fr 1fr 1fr 1fr;
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
    p {
      color: var(--color-text-lighter);
      font-size: var(--font-size-s);
    }
  }
}
</style>
