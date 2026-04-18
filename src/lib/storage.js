export async function uploadLogo(companyId, file) {
  void companyId;

  // Logo is now stored as base64 data URL directly in Firestore
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getLogoUrl(companyId) {
  void companyId;

  // Logo URL is now stored directly in the companies Firestore document
  // This function is kept for backward compatibility
  return null;
}

export async function uploadQuotePhoto(companyId, quoteId, file) {
  void companyId;
  void quoteId;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
