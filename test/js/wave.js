(function () {
  var unit = 20,
      canvas, context, canvas2, context2,
      height, width, xAxis, yAxis,
      draw;

  function init() {

      canvas = document.getElementById("sineCanvas");
      canvas.width = 1200;
      canvas.height = 150;

      context = canvas.getContext("2d");

      height = canvas.height;
      width = canvas.width;

      xAxis = Math.floor(height/2);
      yAxis = 0;

      draw();
  }

  function draw() {
      context.clearRect(0, 0, width, height);
	  drawWave('#aca0ff', 0.1, 10, 70, 1);
	  drawWave('#aca0ff', 0.13, 8, 50, 2);
	  drawWave('#aca0ff', 0.12, 10,10, 1);
	  //drawWave('#000', 1, 0.3,10, 1);	  
	  
      draw.seconds = draw.seconds + .009;
      draw.t = draw.seconds*Math.PI;
      setTimeout(draw, 35);
  };
  draw.seconds = 0;
  draw.t = 0;
  
  function drawWave(color, alpha, zoom, delay, waveheight) {
      context.fillStyle = color;
      context.globalAlpha = alpha;
      context.beginPath();
      drawSine(draw.t / 0.5, zoom, delay, waveheight);
      context.lineTo(width + 10, height);
      context.lineTo(0, height);
      context.closePath()
      context.fill(); 
  }
  function drawSine(t, zoom, delay, waveheight) {
      var x = t; 
      var y = Math.sin(x)/zoom;
      context.moveTo(yAxis, unit*y+xAxis); 
      for (i = yAxis; i <= width + 20; i += 20) {
          x = t+(-yAxis+i)/unit/zoom;
          y = Math.sin(x - delay)/waveheight;
          context.lineTo(i, unit*y+xAxis);
      }
  }

  //init();
  
  window['WaveInit'] = init;    
})();