var d_hd_id = 805;
var d_user_pic = "./images/r_tx_01.jpg";

function AppInit() {
  try {
    app_init();
  } catch (e) {}
}

Vue.component("tool-tip", {
  template: `
		<div ref="el" class="bt-tip-wrapper">
			<slot name="title"></slot>
			<div class="t-more">
				<slot name="more"></slot>
			</div>
		</div>
	`,
  mounted: function () {
    this.$nextTick(() => {
      this.initTip();
    });
  },
  methods: {
    initTip: function () {
      ns.toolTip({
        el: this.$refs.el,
      });
    },
  },
});

// show_DNF_Dialog()

function show_DNF_Dialog(qr) {
  var AFOCLF = null;
  ActivityFocusesOnWeChat({
    title: window.$t("DNF网咖活动"),
    description: window.$t("本网吧已开启DNF排行榜活动"),
    tips: window.$t("扫码关注可获得您的排名变更动态"),
    qr: qr,
    polling: function (close) {
      AFOCLF = ns.loopFunc({
        handle: function (next, stop) {
          $.ajax({
            url: appConfig.server_huangzhu + "/huodong/follow",
            data: {
              checkWeixin: 1,
            },
            success: function (res) {
              res = ns.defaultType("Object", res);
              res.data = ns.defaultType("Object", res.data);
              console.log("关注状态：", res);
              if (res.code === 0 && ns.getType(res.data.qr) !== "String") {
                stop();
                close();
              } else {
                next();
              }
            },
          });
        },
        sleepTime: 5000,
        overTime: { time: 1000 * 60 * 10 },
      });
      AFOCLF.start();
    },
    onClose: function () {
      AFOCLF && AFOCLF.stop();
    },
  });
}

/////////////////////////////////////////
bestime.ready(Ready);
function Ready() {
  new Vue({
    el: "#app",
    data: {
      tabIndex: 1,
      swiperData: [],
      pageType: "",
      activityData: {
        hd_record: [],
        hd_ranking: [],
      },
    },
    mounted: function () {
      var self = this;
      this.$nextTick(function () {
        this.resetSwiper();
        AppInit();
        self.initStarAndWave();
        self.getActivityData();
        ns.removeClass(document.body, "body_hide");
      });
    },
    computed: {
      currentUser: function () {
        var uid = this.activityData.hd_uid;
        var uidData = {
          face: d_user_pic,
          id: uid,
          max_wins: 0,
          rank: 0,
        };
        try {
          uidData = this.activityData.uid_data[uid] || uidData;
        } catch (e) {}

        return {
          name: uidData.nickname || "-",
          data: uidData,
        };
      },
      recordData: function () {
        var result = [];
        for (var a = 0; a < this.activityData.hd_record.length; a++) {
          var item = this.activityData.hd_record[a];
          var one = this.activityData.uid_data[item.uid];
          if (one) {
            one.face = one.face || d_user_pic;
            item.user = one;
            result.push(item);
          }
        }

        /*
				result = [
					{
						gift_name: '一二三四五六七八九十',
						ctime: 123135153,
						user: {
							nickname: 'bestime'
						}
					}
				]
				*/

        console.log(result);

        return result;
      },
    },
    methods: {
      checkAttention: function () {
        if (ns.getCookie("dnf-qr-wx-once") == "showed") return;
        var self = this;
        $.ajax({
          url: appConfig.server_huangzhu + "/huodong/follow",
          data: {
            checkWeixin: 1,
          },
          success: function (res) {
            res = ns.defaultType("Object", res);
            res.data = ns.defaultType("Object", res.data);
            /*
						res.code = 0
						res.data.qr = 'https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=gQG-8TwAAAAAAAAAAS5odHRwOi8vd2VpeGluLnFxLmNvbS9xLzAyR3h0X0k2R19mNGsxQjdsdGhzY1MAAgSHrJxcAwTAqAAA'
						*/

            if (ns.getType(res.data.qr) === "String") {
              ns.setCookie("dnf-qr-wx-once", "showed");
              show_DNF_Dialog(res.data.qr);
            }
          },
        });
      },
      getActivityData: function () {
        try {
          var activity_id = app.get_param();
          if (typeof activity_id == "boolean" || !activity_id) {
            activity_id = d_hd_id;
          }
        } catch (e) {
          var activity_id = d_hd_id;
        }

        var query = {
          id: activity_id,
        };
        $.ajax({
          url: appConfig.server + "/huodong/view",
          type: "GET",
          data: query,
          success: (res) => {
            res = ns.defaultType("Object", res);
            res.data = ns.defaultType("Object", res.data);
            if (res.data.ways === "dnf_top") {
              this.checkAttention();
            }
            if (res.code == 0) {
              this.activityData = res.data;
              this.swiperData = res.data.gift_goods;
              if (res.data.hd_is_top == 1) {
                this.pageType = "type2";
              } else {
                this.pageType = "type1";
              }
              console.log(this.activityData);
              this.$nextTick(() => {
                this.resetSwiper();
              });
            } else if (res.msg) {
              ns.dialog({
                oFather: this.$refs.mainBox,
                title: window.$t("活动提示"),
                msg: res.msg,
                mask: true,
                maskClick: false,
                confirmText: window.$t("知道了"),
                showCancel: false,
                onClosed: function (step) {
                  app.close();
                  console.log("我点击了：" + step);
                },
              });
            }
          },
        });
      },
      resetSwiper: function () {
        var size = 5;
        this.swiper = new Swiper(".swiper0415", {
          pagination: ".swiper-pagination",
          nextButton: ".swiper-button-next",
          prevButton: ".swiper-button-prev",
          slidesPerView: size,
          paginationClickable: true,
          spaceBetween: 30,
          loop: false,
        });
        var oSwiper0414 = ns.getByClass("slide0414")[0];

        if (
          ns.getType(this.swiper.slides) == "Array" &&
          this.swiper.slides.length <= size
        ) {
          ns.addClass(oSwiper0414, "onePage");
          this.swiper.disableTouchControl();
        } else {
          ns.removeClass(oSwiper0414, "onePage");
          this.swiper.enableTouchControl();
        }
      },
      tabGoTo: function (index) {
        if (ns.hasClass(document.getElementById("app"), "type1")) {
          return false;
        }
        var oTabContent = ns.getByClass("mainTabContent")[0];
        this.tabIndex = index;
        var Left = -468 * (index - 1);
        Tween.move(
          oTabContent,
          { "margin-left": Left },
          700,
          Tween.Cubic.easeInOut,
        );
      },
      initStarAndWave: function () {
        WaveInit();
        CanvasStar({
          wrapperId: "starCanvas",
          imgUrl: "./images/star.png",
          oFather: document.getElementById("canvasWrapper"),
        });
      },
      getCorrectSrc: function (ev) {
        ns.imgOnerror(
          ev.currentTarget,
          `${appConfig.staticPath}/images/no-qr.jpg`,
        );
      },
    },
  });
}
