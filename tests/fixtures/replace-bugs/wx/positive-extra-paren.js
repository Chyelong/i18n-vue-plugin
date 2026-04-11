Page({
  methods: {
    showSuccess() {
      wx.showToast({ title: '成功' });
      wx.showModal({ content: '确定删除？' });
    }
  }
});
