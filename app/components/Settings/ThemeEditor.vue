<script setup lang="ts">
import { Alert, Badge, Button, Card, Divider, Flex, Grid, Modal, Sidebar } from '@dolanske/vui'

interface Props {
  open: boolean
}

const {
  open,
} = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Modal size="screen" :open class="theme-editor" @close="emit('close')">
    <div class="vui-sidebar-layout">
      <Sidebar :width="324" floaty>
        TODO: list color groups

        <template #footer>
          <Divider />
          <Flex x-end expand>
            <Button size="m">
              Cancel
            </Button>
            <Button size="m" variant="accent">
              Save
            </Button>
          </Flex>
        </template>
      </Sidebar>

      <div class="container container-s p-xs">
        <h1 class="mb-s">
          Sample Theme
        </h1>

        <p class="text-color-light text-l mb-xxl block">
          Make sure you get the contrast right.
          <span class="text-color-lighter text-l">
            But you can of course make it goofy, as long as it's somewhat useable.
          </span>
          <span class="text-color-lightest text-l">
            Ok bro?
          </span>
        </p>

        <Card separators class="card-bg mb-xxl">
          <template #header>
            <Flex y-center x-start gap="xs">
              <h5 class="flex-1">
                Your theme is
              </h5>
              <Badge variant="danger">
                Insane
              </Badge>
              <Badge variant="info">
                Accessible
              </Badge>
              <Badge variant="success">
                Approved
              </Badge>
              <Badge variant="accent">
                Based
              </Badge>
              <Badge variant="warning">
                Dangerous
              </Badge>
            </Flex>
          </template>
          <p class="mb-m">
            Lorem ipsum dolor, sit amet consectetur adipisicing elit. A voluptate molestiae aperiam commodi facilis minima vel neque, ipsum, dignissimos ratione labore et ea dolorem delectus reprehenderit incidunt soluta, quam laborum!
          </p>

          <Alert variant="warning" filled class="mb-xs">
            Make sure your theme is not just <code>#fff</code> or else!!
          </Alert>

          <p class="text-color-lightest text-xs">
            You might get banned for doing so.... Lorem ipsum dolor, sit amet consectetur adipisicing elit. Impedit, iure modi ut vel, iusto explicabo iste, placeat commodi quis voluptates possimus! Ullam magnam molestias modi exercitationem quod recusandae, facere mollitia.
          </p>

          <template #footer>
            <Flex x-end>
              <Button size="s">
                Cancel
              </Button>
              <Button size="s" variant="fill">
                Save
              </Button>
            </Flex>
          </template>
        </Card>

        <h4 class="mb-s">
          Backgrounds & Borders
        </h4>

        <Grid expand :columns="3" class="mb-m">
          <div class="example-card weak">
            <p>Weak border</p>
          </div>
          <div class="example-card ">
            <p>Default border</p>
          </div>
          <div class="example-card strong">
            <p>Strong border</p>
          </div>
        </Grid>

        <Grid expand :columns="4" class="mb-xxl">
          <div class="example-card lowered">
            <p>Lowered</p>
          </div>
          <div class="example-card ">
            <p>Normal</p>
          </div>
          <div class="example-card medium">
            <p>Medium</p>
          </div>
          <div class="example-card raised">
            <p>Raised</p>
          </div>
        </Grid>

        <h4 class="mb-s">
          Solid colors
        </h4>

        <Flex>
          <Badge variant="accent" filled>
            Hivecom
          </Badge>
          <Badge variant="danger" filled>
            Community
          </Badge>
          <Badge variant="info" filled>
            Gaming
          </Badge>
          <Badge variant="neutral" filled>
            Friends
          </Badge>
          <Badge variant="success" filled>
            Creators
          </Badge>
          <Badge variant="warning" filled>
            Travellers
          </Badge>
        </Flex>
      </div>
    </div>
  </Modal>
</template>

<style lang="scss">
// Not scoping styles allows us to override vue internal styles a lot easier
.theme-editor {
  /* > .vui-card {
    .vui-card-content {
      padding: 0 !important;
      position: absolute;
      inset: 0;
    }

    .vui-card-header {
      background-color: transparent !important;
    }
  } */

  .vui-sidebar {
    background-color: var(--color-bg-medium);
  }

  .example-card {
    display: block;
    width: 100%;
    text-align: center;

    padding: var(--space-l);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    color: var(--color-text-light);

    &.weak {
      border-color: var(--color-border-weak);
      color: var(--color-text-lighter);
    }

    &.strong {
      border-color: var(--color-border-strong);
      color: var(--color-text);
    }

    &.lowered {
      background-color: var(--color-bg-lowered);
    }

    &.raised {
      background-color: var(--color-bg-raised);
    }

    &.medium {
      background-color: var(--color-bg-medium);
    }
  }
}
</style>
