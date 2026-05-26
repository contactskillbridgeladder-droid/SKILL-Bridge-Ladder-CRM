export const uploadToCloudinary = async (
  file: File | Blob,
  resourceType: "image" | "video" | "raw" | "auto",
  onProgress?: (progress: number) => void
): Promise<string> => {
  try {
    const workerUrl = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";
    const signRes = await fetch(`${workerUrl}/cloudinary/sign`, { method: 'POST' });
    const signData = await signRes.json();
    
    if (!signRes.ok) {
      throw new Error(signData.error || "Failed to sign Cloudinary request");
    }
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", signData.apiKey || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || "989943544584715");
    formData.append("timestamp", signData.timestamp.toString());
    formData.append("signature", signData.signature);
    formData.append("folder", signData.folder);

    const cloudName = signData.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dzmfmuwn5";
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, true);
      
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          resolve(response.secure_url);
        } else {
          reject(new Error(xhr.responseText));
        }
      };
      
      xhr.onerror = () => reject(new Error("Cloudinary upload failed"));
      xhr.send(formData);
    });
  } catch (error) {
    console.error("uploadToCloudinary error:", error);
    throw error;
  }
};
