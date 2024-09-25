<script setup lang="ts">
const supabase = useSupabaseClient()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div>
    <header>
      <h1>Navbar</h1>
      <button @click="signOut">
        logout
      </button>

      <hr>
    </header>
    <slot />
  </div>
</template>
