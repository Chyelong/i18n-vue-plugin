<template>
  <div>
    <!-- Should replace -->
    <p>你好世界</p>
    <el-button :title="'确认提交'">提交</el-button>

    <!-- Should skip: el-table-column prop -->
    <el-table-column :prop="'数据字段'" label="标题"></el-table-column>
    <el-tab-pane :name="'标签名'" label="展示名"></el-tab-pane>
  </div>
</template>
<script>
export default {
  methods: {
    test() {
      // Should replace
      this.title = '你好';
      let msg = '世界';
      // Should skip
      switch(type) { case '待处理': break; }
      habit.set('存储键', val);
      this.$router.push({ name: '路由名' });
      EventBus.$emit('事件名');
      arr.indexOf('匹配值');
      obj['字段名'];
      localStorage.setItem('本地键', val);
    }
  }
}
</script>
