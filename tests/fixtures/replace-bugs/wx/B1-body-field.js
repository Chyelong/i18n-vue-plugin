Page({
  pay() {
    wx.request({
      url: '/api/pay',
      data: { body: '包时套餐充值', amount: 100 }
    });
  }
});
