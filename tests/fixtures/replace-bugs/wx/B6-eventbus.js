Page({
  onLoad() {
    EventBus.on('订单支付成功', this.handlePaid);
    $bus.emit('用户登录', { uid: 1 });
  }
});
