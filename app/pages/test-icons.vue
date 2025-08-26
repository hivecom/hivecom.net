<template>
  <div style="padding: 20px;">
    <h1>Icon Test Page</h1>
    <p>Testing Phosphor icons used in KPI cards:</p>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">
      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:bell" size="24" />
        <span style="margin-left: 8px;">ph:bell</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:check-circle" size="24" />
        <span style="margin-left: 8px;">ph:check-circle</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:chat-circle-dots" size="24" />
        <span style="margin-left: 8px;">ph:chat-circle-dots</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:calendar" size="24" />
        <span style="margin-left: 8px;">ph:calendar</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:user-check" size="24" />
        <span style="margin-left: 8px;">ph:user-check</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:heart" size="24" />
        <span style="margin-left: 8px;">ph:heart</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:info" size="24" />
        <span style="margin-left: 8px;">ph:info</span>
      </div>

      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
        <Icon name="ph:chat-circle" size="24" />
        <span style="margin-left: 8px;">ph:chat-circle</span>
      </div>
    </div>

    <h2 style="margin-top: 40px;">
      KPI Card Test
    </h2>
    <div style="max-width: 300px;">
      <AdminKPICard
        label="Test KPI"
        :value="42"
        icon="ph:bell"
        variant="warning"
        description="This is a test KPI card with an icon"
      />
    </div>
  </div>
</template>
