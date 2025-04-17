<script setup lang="ts">
import { Divider } from '@dolanske/vui'
import DonationBar from '~/components/Community/DonationBar..vue'
</script>

<template>
  <div class="page">
    <section>
      <h1>Community</h1>
      <p>Friends building things together</p>
    </section>
    <Divider />
    <section>
      <ul>
        <li>Introduction</li>
        <li>Staff Cards (Administrators, Project Contributors & Moderators)</li>
        <li>Community Goals and Values</li>
        <li>Funding progress and perks</li>
        <li>Random selection of members</li>
      </ul>
    </section>
    <DonationBar class="mt-l" />
  </div>
</template>
