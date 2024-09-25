<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const err = ref('')

async function signInWithOtp() {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: 'http://localhost:3000/confirm',
    },
  })
  if (error)
    err.value = error.message
}

watch(email, () => {
  if (err.value)
    err.value = ''
})
</script>

<template>
  <div>
    <button @click="signInWithOtp">
      Sign In with E-Mail
    </button>
    <input v-model="email" type="email">

    <p v-if="err">
      {err}
    </p>
  </div>
</template>
