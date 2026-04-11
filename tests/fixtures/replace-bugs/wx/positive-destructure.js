Page({
  data: { obtain: '' },
  onLoad() {
    const { obtain } = this.data;
    console.log(obtain);
    this.setData({ obtain: '领取成功' });
  }
});
