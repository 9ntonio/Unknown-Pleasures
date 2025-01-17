const AUDIO_URL = "./disorder.mp3";

const canvas = document.getElementById("visualizer");
const playButton = document.getElementById("playButton");
const statusDiv = document.getElementById("site-title");
const ctx = canvas.getContext("2d");

let audioContext, analyser, source;
let isPlaying = false;
let audioBuffer = null;

const numberOfLines = 60;
const waveformHistory = [];
const frameInterval = 33; // 30 fps

let lastFrameTime = 0;
let animationFrameId = null;

async function initAudio() {
  try {
    statusDiv.textContent = "Loading";
    const response = await fetch(AUDIO_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    // Initialize audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    // Decode audio data
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    statusDiv.textContent = "Unknown Pleasures";
    playButton.disabled = false;
  } catch (error) {
    console.error("Error initializing audio:", error);
    statusDiv.textContent = `Error: ${error.message}`;
  }
}

function setupAndPlay() {
  if (!audioBuffer) {
    statusDiv.textContent = "Error: Audio not loaded";
    return;
  }

  if (isPlaying) {
    // Stop playing
    if (source) {
      source.stop();
      source.disconnect();
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    isPlaying = false;
    playButton.textContent = "Play";

    // Start fade out animation
    const startTime = performance.now();
    const fadeOutDuration = 3000; // 3 seconds
    const currentWaveforms = [...waveformHistory]; // Save current waveform state

    function fadeOut(currentTime) {
      const elapsed = currentTime - startTime;
      const opacity = Math.max(0, 1 - elapsed / fadeOutDuration);

      if (elapsed >= fadeOutDuration) {
        // Clear canvas after fade
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        waveformHistory.length = 0;
        return;
      }

      // Draw frame with fading opacity
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      currentWaveforms.forEach((historicalData, j) => {
        ctx.beginPath();
        const padding = canvas.height * 0.1;
        const usableHeight = canvas.height - padding * 2;
        const baseY =
          canvas.height - padding - j * (usableHeight / numberOfLines);

        for (let i = 0; i < historicalData.length; i++) {
          const x = (i / historicalData.length) * canvas.width;
          const frequencyValue = historicalData[i];
          const perspectiveScale = 1 - (j / numberOfLines) * 0.6;

          const y =
            baseY -
            frequencyValue *
              perspectiveScale *
              0.5 *
              Math.sin((i / historicalData.length) * Math.PI);

          if (i === 0) {
            ctx.moveTo(x, baseY);
          } else if (i === historicalData.length - 1) {
            ctx.lineTo(x, baseY);
          } else {
            const prevX = ((i - 1) / historicalData.length) * canvas.width;
            const prevFreq = historicalData[i - 1];
            const prevY =
              baseY -
              prevFreq *
                perspectiveScale *
                0.5 *
                Math.sin(((i - 1) / historicalData.length) * Math.PI);

            const cpX = (x + prevX) / 2;
            ctx.quadraticCurveTo(prevX, prevY, cpX, (y + prevY) / 2);
          }
        }

        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.9})`;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      });

      requestAnimationFrame(fadeOut);
    }

    requestAnimationFrame(fadeOut);
  } else {
    // Start playing
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.loop = true;
    source.start(0);
    isPlaying = true;
    playButton.textContent = "Stop";
    draw();
  }
}

function makeSymmetric(dataArray) {
  const result = new Uint8Array(dataArray.length);

  for (let i = 0; i < dataArray.length; i++) {
    // Create a symmetric pattern by mirroring around the center
    const normalizedPos = i / (dataArray.length - 1);
    const symmetricFactor = Math.sin(normalizedPos * Math.PI);

    // Blend the original value with the symmetric pattern
    result[i] = dataArray[i] * symmetricFactor;
  }

  // Ensure start and end points are exactly the same (zero)
  result[0] = 0;
  result[result.length - 1] = 0;

  return result;
}

function draw() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame(currentTime) {
    if (!isPlaying) return;

    animationFrameId = requestAnimationFrame(renderFrame);

    if (currentTime - lastFrameTime < frameInterval) {
      return;
    }

    lastFrameTime = currentTime;

    analyser.getByteFrequencyData(dataArray);

    // Make the waveform symmetric
    const symmetricData = makeSymmetric(dataArray);
    waveformHistory.unshift([...symmetricData]);

    if (waveformHistory.length > numberOfLines) {
      waveformHistory.pop();
    }

    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    waveformHistory.forEach((historicalData, j) => {
      ctx.beginPath();
      // Add padding at the top and bottom
      const padding = canvas.height * 0.05;
      const usableHeight = canvas.height - padding * 2;
      const baseY =
        canvas.height - padding - j * (usableHeight / numberOfLines);

      for (let i = 0; i < bufferLength; i++) {
        const x = (i / bufferLength) * canvas.width;
        const frequencyValue = historicalData[i];
        const perspectiveScale = 1 - (j / numberOfLines) * 0.6;

        const y =
          baseY -
          frequencyValue *
            perspectiveScale *
            0.5 *
            Math.sin((i / bufferLength) * Math.PI);

        if (i === 0) {
          ctx.moveTo(x, baseY); // Start at baseline
        } else if (i === bufferLength - 1) {
          ctx.lineTo(x, baseY); // End at baseline
        } else {
          const prevX = ((i - 1) / bufferLength) * canvas.width;
          const prevFreq = historicalData[i - 1];
          const prevY =
            baseY -
            prevFreq *
              perspectiveScale *
              0.5 *
              Math.sin(((i - 1) / bufferLength) * Math.PI);

          const cpX = (x + prevX) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, (y + prevY) / 2);
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2 + (numberOfLines - j) * 0.025; // Thicker at bottom
      ctx.stroke();
    });
  }

  renderFrame(0);
}

// Initialize event listeners
playButton.disabled = true; // Disable button until audio is loaded
playButton.addEventListener("click", setupAndPlay);

// Start loading the audio when the page loads
initAudio();
