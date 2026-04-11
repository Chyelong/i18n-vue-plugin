<template>
  <div>
    <el-button>{{ $t('提交') }}</el-button>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: 'active'
    };
  },
  methods: {
    handle() {
      if (this.status === window.$t('已完成')) {
        console.log('done');
      }
      switch (this.status) {
        case window.$t('进行中'):
          break;
      }
    }
  }
};
</script>
