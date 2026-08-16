import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = "https://sunopdf.onrender.com";

export default function App() {
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState("en");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);

  const [translatedText, setTranslatedText] = useState("");

  // =========================================
  // CLEANUP AUDIO BLOB
  // =========================================

  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith("blob:")) {
        window.URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // =========================================
  // FILE SELECT
  // =========================================

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (!selectedFile) {
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      alert("Please select a valid PDF file.");
      e.target.value = "";
      return;
    }

    // Remove old audio
    if (audioUrl && audioUrl.startsWith("blob:")) {
      window.URL.revokeObjectURL(audioUrl);
    }

    setFile(selectedFile);
    setMessage("");
    setAudioUrl("");
    setAudioBlob(null);
    setTranslatedText("");
  };

  // =========================================
  // LANGUAGE CHANGE
  // =========================================

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);

    if (audioUrl && audioUrl.startsWith("blob:")) {
      window.URL.revokeObjectURL(audioUrl);
    }

    setMessage("");
    setAudioUrl("");
    setAudioBlob(null);
    setTranslatedText("");
  };

  // =========================================
  // UPLOAD + CONVERT
  // =========================================

  const uploadFile = async () => {
    if (!file) {
      alert("Please select a PDF first.");
      return;
    }

    setLoading(true);
    setMessage("⏳ PDF is being converted...");
    setAudioUrl("");
    setAudioBlob(null);
    setTranslatedText("");

    const formData = new FormData();

    formData.append("file", file);
    formData.append("language", language);

    try {
      console.log("Uploading PDF...");
      console.log("Backend:", API_BASE_URL);
      console.log("Language:", language);

      // =====================================
      // SEND PDF TO RENDER BACKEND
      // =====================================

      const response = await axios.post(
        `${API_BASE_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          timeout: 120000,
        }
      );

      console.log("Upload Success:", response.data);

      // =====================================
      // SUCCESS MESSAGE
      // =====================================

      setMessage(
        response.data.message ||
          "🎉 Audio Generated Successfully!"
      );

      // =====================================
      // TRANSLATED TEXT
      // =====================================

      if (response.data.translated_text) {
        setTranslatedText(
          response.data.translated_text
        );
      }

      // =====================================
      // AUDIO URL
      // =====================================

      let finalAudioUrl = "";

      if (response.data.audio_url) {
        finalAudioUrl =
          response.data.audio_url;

        // Convert localhost URL to Render URL
        if (
          finalAudioUrl.includes(
            "127.0.0.1:8000"
          ) ||
          finalAudioUrl.includes(
            "localhost:8000"
          )
        ) {
          finalAudioUrl =
            finalAudioUrl.replace(
              /^https?:\/\/(127\.0\.0\.1|localhost):8000/,
              API_BASE_URL
            );
        }

        // If backend returns relative URL
        if (
          finalAudioUrl.startsWith("/")
        ) {
          finalAudioUrl =
            `${API_BASE_URL}${finalAudioUrl}`;
        }
      } else {
        // Backup audio URL
        finalAudioUrl =
          `${API_BASE_URL}/audio?time=${Date.now()}`;
      }

      console.log(
        "Final Audio URL:",
        finalAudioUrl
      );

      // =====================================
      // FETCH AUDIO AS BLOB
      // =====================================

      setMessage(
        "🎧 Audio generated! Loading audio..."
      );

      const audioResponse =
        await fetch(finalAudioUrl);

      if (!audioResponse.ok) {
        throw new Error(
          `Audio loading failed: ${audioResponse.status}`
        );
      }

      const contentType =
        audioResponse.headers.get(
          "content-type"
        );

      console.log(
        "Audio Content-Type:",
        contentType
      );

      const blob =
        await audioResponse.blob();

      if (blob.size === 0) {
        throw new Error(
          "Audio file is empty."
        );
      }

      console.log(
        "Audio Blob Size:",
        blob.size
      );

      // =====================================
      // CREATE LOCAL BLOB URL
      // =====================================

      const blobUrl =
        window.URL.createObjectURL(blob);

      setAudioBlob(blob);
      setAudioUrl(blobUrl);

      setMessage(
        "🎉 Audio Generated Successfully!"
      );

      alert(
        "🎉 PDF Successfully Converted to Audio!"
      );

    } catch (error) {
      console.error(
        "================================="
      );

      console.error(
        "UPLOAD/AUDIO ERROR:",
        error
      );

      console.error(
        "================================="
      );

      setMessage("");
      setAudioUrl("");
      setAudioBlob(null);
      setTranslatedText("");

      let errorMessage =
        "Network Error. Please try again.";

      if (error.response) {
        errorMessage =
          error.response.data?.detail ||
          error.response.data?.message ||
          `Server Error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage =
          "Cannot connect to SunoPDF server. Please check your internet connection or Render service.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      alert(errorMessage);

    } finally {
      setLoading(false);
    }
  };

  // =========================================
  // DOWNLOAD MP3
  // =========================================

  const handleDownload = () => {
    if (!audioBlob) {
      alert(
        "Audio is not ready yet. Please wait."
      );
      return;
    }

    try {
      const downloadUrl =
        window.URL.createObjectURL(
          audioBlob
        );

      const link =
        document.createElement("a");

      link.href = downloadUrl;

      const cleanName = file
        ? file.name
            .replace(/\.pdf$/i, "")
            .replace(
              /[^a-zA-Z0-9-_]/g,
              "_"
            )
        : "audio";

      link.download =
        `SunoPDF-${cleanName}.mp3`;

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(
          downloadUrl
        );
      }, 1000);

      console.log(
        "MP3 Download Started"
      );

    } catch (error) {
      console.error(
        "Download failed:",
        error
      );

      alert(
        "Unable to download audio."
      );
    }
  };

  // =========================================
  // LANGUAGE NAME
  // =========================================

  const getLanguageName = () => {
    if (language === "hi") {
      return "Hindi";
    }

    if (language === "mr") {
      return "Marathi";
    }

    return "English";
  };

  // =========================================
  // UI
  // =========================================

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #4f46e5, #06b6d4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "30px",
        boxSizing: "border-box",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "800px",
          background: "white",
          borderRadius: "25px",
          padding: "45px",
          boxSizing: "border-box",
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.2)",
          textAlign: "center",
        }}
      >

        {/* HEADING */}

        <h1
          style={{
            fontSize: "42px",
            margin: 0,
            color: "#4338ca",
          }}
        >
          🎧 SunoPDF
        </h1>

        <p
          style={{
            fontSize: "20px",
            color: "#555",
            marginTop: "10px",
            marginBottom: "35px",
          }}
        >
          Convert Any PDF into AI Voice
        </p>

        {/* FILE UPLOAD */}

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          disabled={loading}
          style={{
            width: "100%",
            padding: "15px",
            border: "1px solid #ddd",
            borderRadius: "10px",
            boxSizing: "border-box",
            cursor: loading
              ? "not-allowed"
              : "pointer",
          }}
        />

        {/* SELECTED FILE */}

        {file && (
          <div
            style={{
              marginTop: "15px",
              padding: "15px",
              background: "#f8fafc",
              borderRadius: "10px",
              textAlign: "left",
            }}
          >
            <div
              style={{
                color: "#444",
                fontSize: "15px",
              }}
            >
              📄 Selected PDF
            </div>

            <strong
              style={{
                display: "block",
                marginTop: "5px",
                color: "#4338ca",
                wordBreak: "break-word",
              }}
            >
              {file.name}
            </strong>

            <div
              style={{
                marginTop: "5px",
                color: "#777",
                fontSize: "13px",
              }}
            >
              {(file.size / 1024).toFixed(2)} KB
            </div>
          </div>
        )}

        {/* LANGUAGE */}

        <select
          value={language}
          onChange={handleLanguageChange}
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "20px",
            padding: "15px",
            borderRadius: "10px",
            border: "1px solid #ddd",
            fontSize: "16px",
            backgroundColor: loading
              ? "#f3f4f6"
              : "white",
            cursor: loading
              ? "not-allowed"
              : "pointer",
          }}
        >
          <option value="en">
            🇬🇧 English
          </option>

          <option value="hi">
            🇮🇳 Hindi
          </option>

          <option value="mr">
            🇮🇳 Marathi
          </option>
        </select>

        {/* CONVERT BUTTON */}

        <button
          onClick={uploadFile}
          disabled={loading || !file}
          style={{
            width: "100%",
            marginTop: "25px",
            padding: "16px",
            border: "none",
            borderRadius: "10px",
            background:
              loading || !file
                ? "#9ca3af"
                : "#4338ca",
            color: "white",
            fontSize: "18px",
            fontWeight: "bold",
            cursor:
              loading || !file
                ? "not-allowed"
                : "pointer",
          }}
        >
          {loading
            ? "⏳ Converting..."
            : "🎧 Convert to Audio"}
        </button>

        {/* STATUS */}

        {message && (
          <div
            style={{
              marginTop: "25px",
              padding: "15px",
              background: "#ecfdf5",
              borderRadius: "10px",
              color: "#15803d",
              fontWeight: "600",
            }}
          >
            {message}
          </div>
        )}

        {/* TRANSLATED TEXT */}

        {translatedText && !loading && (
          <div
            style={{
              marginTop: "25px",
              padding: "20px",
              background: "#f8fafc",
              borderRadius: "15px",
              border:
                "1px solid #e2e8f0",
              textAlign: "left",
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: "12px",
                color: "#4338ca",
                textAlign: "center",
              }}
            >
              📝 Translated Text
            </h3>

            <div
              style={{
                fontSize: "17px",
                lineHeight: "1.8",
                color: "#222",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {translatedText}
            </div>

            <p
              style={{
                marginBottom: 0,
                marginTop: "15px",
                fontSize: "13px",
                color: "#777",
                textAlign: "center",
              }}
            >
              🔊 Voice Language:{" "}
              <strong>
                {getLanguageName()}
              </strong>
            </p>
          </div>
        )}

        {/* AUDIO PLAYER */}

        {audioUrl && !loading && (
          <div
            style={{
              marginTop: "25px",
              padding: "20px",
              background: "#f8fafc",
              borderRadius: "15px",
            }}
          >
            <h3
              style={{
                marginTop: 0,
                color: "#4338ca",
              }}
            >
              🎧 Listen to Your PDF
            </h3>

            <audio
              key={audioUrl}
              controls
              preload="auto"
              src={audioUrl}
              style={{
                width: "100%",
              }}
            >
              Your browser does not support
              the audio element.
            </audio>

            {/* DOWNLOAD */}

            <button
              onClick={handleDownload}
              disabled={!audioBlob}
              style={{
                marginTop: "20px",
                padding: "14px 25px",
                background: !audioBlob
                  ? "#9ca3af"
                  : "#10b981",
                color: "white",
                border: "none",
                borderRadius: "10px",
                fontWeight: "bold",
                fontSize: "16px",
                cursor: !audioBlob
                  ? "not-allowed"
                  : "pointer",
                boxShadow:
                  "0 4px 6px rgba(0,0,0,0.1)",
              }}
            >
              ⬇ Download MP3
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
