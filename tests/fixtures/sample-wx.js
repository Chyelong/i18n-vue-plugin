const app = getApp()

Page({
  data: {
    title: '订单列表'
  },
  onLoad() {
    wx.showToast({ title: '加载成功' })
    wx.setStorageSync('user_key', '存储键不翻译')
    wx.getStorageSync('cache_key')
    console.log('调试信息不翻译')
    // 注释中的中文不翻译
    const status = item.status === '已完成' ? '完成' : '进行中'
    const path = require('../../utils/common.js')
    wx.showModal({
      title: '提示',
      content: '确认删除吗？',
      confirmText: '确定',
      cancelText: '取消'
    })
    const msg = `共${this.data.count}件商品`
  }
})
