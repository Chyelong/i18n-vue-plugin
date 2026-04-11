<script>
export default {
  methods: {
    buildMsg(seat, minutes) {
      // 1. 简单模板字符串
      const msg1 = `该机预计可能在${minutes}分下机`;
      // 2. 三元嵌套模板字符串
      const msg2 = `${seat}座位${seat > 0 ? '有人' : '无人'}`;
      return msg1 + msg2;
    }
  }
};
</script>
