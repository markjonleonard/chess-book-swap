<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="site-header">
    <RouterLink to="/" class="site-title">Chess Book Swap</RouterLink>
  </header>
  <main class="site-main">
    <RouterView />
  </main>
  <footer class="site-footer">
    <p>For players in the Wiltshire and Somerset leagues.</p>
  </footer>
</template>
