;!function () {
	window['CanvasStar'] = function (opt) {
		var oFather = opt.oFather || document.body;
		if(!oFather) return;
		
		var canvas = document.getElementById(opt.wrapperId);
		var ctx = canvas.getContext('2d');
		canvas.width = oFather.offsetWidth;
		canvas.height = oFather.offsetHeight;
		var shanshuoTimer = null;
		var starPic = new Image()
		starPic.src = opt.imgUrl;
		
		var deviation_r = 1.5; //外框圆半径偏移
		var typeNum = 7; // 星星图片大小类型
		var starWidth = 7; // 每个星星的视觉区域宽度【根据图片来定】
		var starHeight = 7; // 每个星星的视觉区域高度【根据图片来定】
		
		var stars = getStars(80, false); // 星星数组，[数量,如果位置重复是否重新生成]
		
		// 图片加载完成后再执行
		starPic.onload = function () {
			loopDraw(stars)
			shanshuo(stars)
		}		
		
		function loopDraw (stars) {			
			for(var a=0; a<stars.length; a++) {
				draw(stars[a])
			}
		}

		// 闪烁 + 移动
		function shanshuo (shansuoStar) {			
			clearInterval(shanshuoTimer);
			shanshuoTimer = setInterval(function () {
				var newArr = [];
				ctx.clearRect(0,0,canvas.width,canvas.height);
				for(var a=0; a<shansuoStar.length; a++) {
					var item = shansuoStar[a];
					item.type = item.type+1;
					item.x = item.x + item.speedX * item.dirX
					item.y = item.y + item.speedY * item.dirY
					
					// 星星大小类型
					if(item.type>typeNum) {
						item.type = 1
					}	
					
					// 处理x边界
					if(item.x>=canvas.width) {
						item.dirX=-1
					}else if(item.x<=0){
						item.dirX = 1
					}
					
					// 处理y边界
					if(item.y>=canvas.height) {
						item.dirY=-1
					}else if(item.y<=0) {
						item.dirY = 1
					}
					 
					newArr.push(item)				
				}
				
				loopDraw(newArr);
			}, 150);
		}
		
		// num 需要的星星数量
		// isCreateNew 如果重叠，是否重新生成一个，比较耗费性能，不建议开启，直接忽略重叠的
		function getStars (num, isCreateNew) {
			var result = [];
			for(var a=0; a<num; a++) {				
				var oneStar = createOneStar();
				if(!overlap(result,oneStar)) {
					result.push(oneStar)
				}else {
					if(isCreateNew) {
						while(overlap(result,oneStar)) {
							oneStar = oneStar = createOneStar();
						}
						result.push(oneStar)
					}					
				}
			}
			
			return result;
		}	
		
		function createOneStar () {
			var dir = [-1,1]
			var opacity = getRandom(0,10)/10;
			return {
				x: getRandom(0, canvas.width),
				y: getRandom(0, canvas.height),
				r: getRandom(0, 1),
				color: 'rgba(255,255,255,'+ opacity +')',
				opacity: opacity,
				type: getRandom(1,typeNum),
				speedX: getRandom(0,2)*0.4,
				dirX: dir[getRandom(0,1)],
				speedY: getRandom(0,2)*0.4,
				dirY: dir[getRandom(0,1)]
			}
		}	
		
		// 判断生成的元素是否产生重叠
		function overlap (existStars, currentStar) {
			for(var a=0; a<existStars.length; a++) {
				var item = existStars[a];
				var x1 = item.x - (item.r+deviation_r);
				var x2 = item.x + (item.r+deviation_r);
				var y1 = item.y - (item.r+deviation_r);
				var y2 = item.y + (item.r+deviation_r);
				if((currentStar.x >=x1 && currentStar.x<=x2) || (currentStar.y>=y1 && currentStar.y<=y2)) {
					return true;
				}
			}
			
			return false;
		}
		
		// 随机数
		function getRandom (min, max) {
			return Math.floor( Math.random() * ( max - min + 1 ) ) + min;    
		}
		
		// 画一个对象
		function draw (item) {
			ctx.drawImage(starPic, item.type*starWidth, 0, starWidth, starHeight, item.x,item.y, starWidth, starHeight);
		}
	};
} ();