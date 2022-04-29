<template>
  <v-app-bar
    id="appBar"
    color="blue darken-2"
    app
    dark
  >
    <router-link
      :to="'/'"
      class="router-link"
      v-if="showBack"
    >
      <v-btn
        icon
        text
        class="ma-2"
      >
        <v-icon color="white">
          mdi-chevron-left
        </v-icon>
      </v-btn>
    </router-link>
    <v-app-bar-nav-icon
      class="ma-2"
      v-else
    ></v-app-bar-nav-icon>
    <v-toolbar-title class="text-no-wrap pa-0">{{ title }}</v-toolbar-title>

    <v-spacer></v-spacer>
    <v-tooltip bottom>
      <template v-slot:activator="{ on, attrs }">
        <v-btn
          icon
          text
          class="ma-2"
          @click="$emit('reload', true)"
          v-bind="attrs"
          v-on="on"
        >
          <v-icon color="white">
            {{"mdi-refresh"}}
          </v-icon>
        </v-btn>
      </template>
      <span>Reload resources</span>
    </v-tooltip>

    <v-menu
      offset-y
      :close-on-content-click="false"
    >
      <template v-slot:activator="{ on, attrs }">
        <v-btn
          icon
          v-bind="attrs"
          v-on="on"
        >
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>

      <v-list min-width="300px">

        <v-list-item @click="$emit('togglePathStyle', !isStraight);">
          <v-list-item-icon class="menu-icon">
            <v-icon>{{ isStraight ? 'mdi-sine-wave' : 'mdi-square-wave' }}</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Toggle link style</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item class="list-item">
          <v-list-item-icon class="menu-icon">
            <v-icon>mdi-magnify</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <div class="wrap">
              <v-list-item-title class="menu-title">Zoom</v-list-item-title>
              <v-btn
                icon
                text
                class="d-inline-block mx-1"
                small
                @click="$emit('zoomOut', true)"
                v-bind="attrs"
                v-on="on"
              >
                <v-icon>
                  {{"mdi-minus"}}
                </v-icon>
              </v-btn>
              <span>{{Math.round(scale*100) }}%</span>

              <v-btn
                icon
                text
                class="d-inline-block mx-1"
                small
                @click="$emit('zoomIn', true)"
                v-bind="attrs"
                v-on="on"
              >
                <v-icon>
                  {{"mdi-plus"}}
                </v-icon>
              </v-btn>
            </div>

          </v-list-item-content>
        </v-list-item>

      </v-list>
    </v-menu>

  </v-app-bar>
</template>

<script>
export default {
  name: "AppBar",
  props: {
    title: String,
    showBack: Boolean,
    isStraight: Boolean,
    scale: Number,
  },
};
</script>

<style lang="less" scoped>
#appBar {
  z-index: 2000;
}

.wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  // background-color: aqua;
}

.list-item {
  // background-color: red;
}

.menu-icon {
  // background-color: indigo;
}

.menu-title {
  display: inline-block;
}

.router-link {
  text-decoration: none;
}
</style>