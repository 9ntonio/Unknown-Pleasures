const AUDIO_URL = "./assets/disorder.mp3";
const CANVAS_PADDING = 0.075;

const canvas = document.getElementById("visualizer");
const playButton = document.getElementById("playButton");
const playButtonText = document.getElementById("playButtonText");
const visualizationArea = document.querySelector(".visualization-area");
const statusDiv = document.getElementById("site-title");
const ctx = canvas.getContext("2d");

let audioContext, analyser, source;
let isPlaying = false;
let audioBuffer = null;

const numberOfLines = 54;
const waveformHistory = [];
const frameInterval = 30; //fps

let lastFrameTime = 0;
let animationFrameId = null;

async function initAudio() {
  try {
    // Update UI to show loading state
    statusDiv.textContent = "Loading";

    // Fetch the audio file from the specified URL using the Fetch API
    // AUDIO_URL is defined as "audio/disorder.mp3" at the top of the file
    const response = await fetch(AUDIO_URL);

    // Check if the fetch was successful (status code 200-299)
    // If not, throw an error with the status code
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    // Convert the response into an ArrayBuffer
    // ArrayBuffer is needed for audio processing
    const arrayBuffer = await response.arrayBuffer();

    // Create a new AudioContext - this is the main entry point for working with Web Audio API => https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
    // Uses webkitAudioContext as fallback for older WebKit browsers (Safari/Chrome) from before Web Audio API was standardized
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create an AnalyserNode - this will be used to analyze frequency/time domain data
    analyser = audioContext.createAnalyser();
    // Set FFT (Fast Fourier Transform) size to 512
    // This determines the frequency domain resolution
    // The actual number of data points will be fftSize/2
    analyser.fftSize = 512;

    // Convert the raw audio data (ArrayBuffer) into an AudioBuffer
    // AudioBuffer represents decoded audio data that can be played
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Update UI to show ready state
    statusDiv.textContent = "Unknown Pleasures";
    // Enable the play button now that audio is ready
    playButton.disabled = false;
    playButtonText.textContent = "INITIATE";
  } catch (error) {
    // Log any errors to console and update UI with error message
    console.error("Error initializing audio:", error);
    statusDiv.textContent = `Error: ${error.message}`;
  }
}

/**
 * Handles the play/stop functionality of the audio visualization
 * When playing:
 * - Creates and connects audio nodes
 * - Starts the audio playback and visualization
 * - Updates UI elements
 *
 * When stopping:
 * - Stops audio playback
 * - Initiates a fade-out animation for the visualization
 * - Resets UI elements
 */
function setupAndPlay() {
  // Check if audio is properly loaded
  if (!audioBuffer) {
    statusDiv.textContent = "Error: Audio didn't load";
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
    playButtonText.textContent = "INITIATE";
    visualizationArea.classList.remove("hide-controls");

    // Start fade out animation
    const startTime = performance.now();
    const fadeOutDuration = 1500; // 1.5secs
    const currentWaveforms = [...waveformHistory];

    function fadeOut(currentTime) {
      // Calculate time elapsed since animation started
      const elapsed = currentTime - startTime;
      // Calculate opacity value (1 to 0) based on elapsed time
      const opacity = Math.max(0, 1 - elapsed / fadeOutDuration);

      // Check if animation duration is complete
      if (elapsed >= fadeOutDuration) {
        // Fill canvas with black background
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Clear the waveform history array
        waveformHistory.length = 0;
        return;
      }

      // Clear canvas with black background on each frame
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw each historical waveform with fading opacity
      currentWaveforms.forEach((historicalData, j) => {
        drawWaveform(ctx, historicalData, j, opacity * 0.9);
      });

      // Request next animation frame to continue fade out
      requestAnimationFrame(fadeOut);
    }
    requestAnimationFrame(fadeOut);
  } else {
    // Create and configure audio source node
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    // Connect audio nodes: source -> analyser -> destination
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.loop = true;
    source.start(0);

    // Update state and UI
    isPlaying = true;
    playButtonText.textContent = "TERMINATE";
    visualizationArea.classList.add("hide-controls");
    draw(); // Start the visualization
  }
}

/**
 * Creates a symmetric waveform by applying a sine-based scaling factor to the input data
 * @param {Uint8Array} dataArray - Raw frequency data from the audio analyzer
 * @returns {Uint8Array} - Modified data with symmetric mountain-like shape
 */
function makeSymmetric(dataArray) {
  // Create a new array with same length as input to store modified values
  const result = new Uint8Array(dataArray.length);

  for (let i = 0; i < dataArray.length; i++) {
    // Convert array index to a value between 0 and 1
    // This creates a progression from start (0) to end (1) of the array
    const normalizedPos = i / (dataArray.length - 1);

    // Create a symmetric scaling factor using sine
    // As normalizedPos goes from 0 to 1, sin(normalizedPos * π) creates a smooth curve:
    // - At start (0): sin(0) = 0
    // - At middle (0.5): sin(π/2) = 1
    // - At end (1): sin(π) = 0
    const symmetricFactor = Math.sin(normalizedPos * Math.PI);

    // Scale the original frequency value by the symmetric factor
    // This creates the mountain-like shape where middle frequencies are emphasized
    result[i] = dataArray[i] * symmetricFactor;
  }

  // Force the first and last points to zero
  // This ensures the waveform starts and ends at the baseline
  result[0] = 0;
  result[result.length - 1] = 0;

  return result;
}

/**
 * Calculates the y-position for a point in the waveform
 * Uses sine wave modulation to create the characteristic mountain-like shape
 * @param {number} baseY - The baseline Y position for the waveform
 * @param {number} frequencyValue - The frequency value at this point
 * @param {number} perspectiveScale - Scaling factor for perspective effect (0-1)
 * @param {number} i - Current point index
 * @param {number} totalPoints - Total number of points in the waveform
 * @returns {number} The calculated Y position
 */
function calculateWaveformY(
  baseY,
  frequencyValue,
  perspectiveScale,
  i,
  totalPoints
) {
  // Calculate Y position with sine wave modulation
  // Sine function creates the iconic Unknown Pleasures tapering effect:
  // - Multiplying by sin(0 to π) makes the wave start at 0, peak in middle, return to 0
  // - This creates the mountain-like profile characteristic of the album cover
  return (
    baseY -
    frequencyValue *
      perspectiveScale *
      0.5 *
      Math.sin((i / totalPoints) * Math.PI)
  );
}

/**
 * Draws a single waveform line with the characteristic Unknown Pleasures style
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {Array} historicalData - Array of frequency values for this waveform
 * @param {number} j - Index of this waveform in the history (affects vertical position)
 * @param {number} opacity - Opacity value for the line (0-1)
 */
function drawWaveform(ctx, historicalData, j, opacity = 0.9) {
  // Start a new path for drawing
  ctx.beginPath();

  // Calculate vertical padding and positioning
  const padding = canvas.height * CANVAS_PADDING;
  const usableHeight = canvas.height - padding * 2;
  // Calculate baseline Y position for current waveform
  const baseY = canvas.height - padding - j * (usableHeight / numberOfLines);
  // Calculate perspective scale (lines get smaller towards the back)
  const perspectiveScale = 1 - (j / numberOfLines) * 0.6;

  // Iterate through each data point in the waveform
  for (let i = 0; i < historicalData.length; i++) {
    // Calculate X position based on data point index
    const x = (i / historicalData.length) * canvas.width;
    const frequencyValue = historicalData[i];
    const y = calculateWaveformY(
      baseY,
      frequencyValue,
      perspectiveScale,
      i,
      historicalData.length
    );

    if (i === 0) {
      // Move to start point of the line
      ctx.moveTo(x, baseY);
    } else if (i === historicalData.length - 1) {
      // Draw straight line to end point
      ctx.lineTo(x, baseY);
    } else {
      // Calculate previous point's X position
      const prevX = ((i - 1) / historicalData.length) * canvas.width;
      // Get previous frequency value
      const prevFreq = historicalData[i - 1];
      // Calculate previous point's Y position
      const prevY = calculateWaveformY(
        baseY,
        prevFreq,
        perspectiveScale,
        i - 1,
        historicalData.length
      );

      // Calculate control point X for quadratic curve
      const cpX = (x + prevX) / 2;
      // Draw curved line between points using quadratic bezier
      // quadraticCurveTo(controlX, controlY, endX, endY) creates a curved line:
      // - Uses a control point (prevX, prevY) to define the curve's shape
      // - cpX is the midpoint between current and previous X positions
      // - (y + prevY)/2 creates a smooth curve by averaging current and previous Y positions
      ctx.quadraticCurveTo(prevX, prevY, cpX, (y + prevY) / 2);
    }
  }

  // Set line color with specified opacity
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
  // Set line width - lines get slightly thicker towards the front
  ctx.lineWidth = 2 + (numberOfLines - j) * 0.025;
  // Draw the path
  ctx.stroke();
}

function draw() {
  // Set canvas dimensions to match its display size
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  // Get the number of frequency bins from the analyzer
  const bufferLength = analyser.frequencyBinCount;
  // Create a buffer to store frequency data
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame(currentTime) {
    // Stop rendering if audio is not playing
    if (!isPlaying) return;

    // Schedule next frame
    animationFrameId = requestAnimationFrame(renderFrame);

    // Throttle frame rate based on frameInterval (fps)
    if (currentTime - lastFrameTime < frameInterval) {
      return;
    }
    lastFrameTime = currentTime;

    // Get current frequency data and create symmetric mountain-like shape
    analyser.getByteFrequencyData(dataArray);
    const symmetricData = makeSymmetric(dataArray);
    // Add new waveform to the front of history array
    waveformHistory.unshift([...symmetricData]);

    // Maintain fixed number of historical waveforms
    if (waveformHistory.length > numberOfLines) {
      waveformHistory.pop();
    }

    // Clear canvas with black background
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw each historical waveform
    waveformHistory.forEach((historicalData, j) => {
      drawWaveform(ctx, historicalData, j);
    });
  }

  // Start the animation loop
  renderFrame(0);
}

// Initialize event listeners
playButton.disabled = true;
playButton.addEventListener("click", setupAndPlay);

// Start loading the audio when the page loads
initAudio();
