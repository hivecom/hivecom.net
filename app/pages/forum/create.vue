<script setup lang="ts">
import { defineRules, required, useValidation } from '@dolanske/v-valid'
import { Button, Flex, Input, Tab, Tabs, Textarea } from '@dolanske/vui'
import { normalizeErrors } from '@/lib/utils/formatting'

// TODO: instead of a page, create will have a dropdown for a category or a page
// and both will be a modal. This will make it easier to determine in what context is category or a post being created

// TODO: create page
// 1. choose between creating a post or creating a category
// 2. Saving should allow you to choose if you wanna create more or go to the post

// TODO: clicking create in a nested category should preselect it

type CreateType = 'post' | 'category'

const createType = ref<CreateType>('post')

const form = reactive({
  title: '',
  description: '',
  content: '',
})

function resetForm() {
  Object.assign(form, {
    title: '',
    description: '',
    content: '',
  })
}

const rules = defineRules<typeof form>({
  title: [required],
})

const { validate, errors } = useValidation(form, rules, { autoclear: true })

const submitLoading = ref(false)

async function submitForm() {
  if (submitLoading.value)
    return

  submitLoading.value = true

  validate()
    .then(() => {

    })
}
</script>

<template>
  <div class="page forum">
    <div class="container container-s">
      <NuxtLink to="/forum" aria-label="Go back to Form page">
        <Button
          variant="gray"
          plain
          size="s"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Forum
        </Button>
      </NuxtLink>

      <section class="page-title mb-xl">
        <h1>
          Create
        </h1>
        <p>
          Create a forum post or a category
        </p>
      </section>

      <section>
        <div class="forum-create__tabs">
          <Tabs v-model="createType">
            <Tab value="post">
              Post
            </Tab>
            <Tab value="category">
              Category
            </Tab>
          </Tabs>
        </div>

        <div class="forum-create__form">
          <Flex column gap="m" class="mb-xl">
            <Input v-model="form.title" label="Title" placeholder="Forum post title" required :errors="normalizeErrors(errors.title)" expand />
            <Input v-model="form.description" label="Description" placeholder="Add a short post description" expand />
            <Textarea v-model="form.content" label="Article" placeholder="You can expand on your topic, or leave this empty..." expand :rows="18" hint="You can use markdown" />
          </Flex>

          <Flex x-end expand>
            <Button plain @click="resetForm">
              Reset form
            </Button>
            <Button variant="accent" @click="submitForm">
              Post
            </Button>
          </Flex>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.forum-create {
  &__tabs {
    display: block;
    margin-bottom: var(--space-xxl);
  }
}
</style>
