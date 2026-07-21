const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  const sa: ServiceAccount = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const unsigned = `${header}.${payload}`;

  const pemContents = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Buffer.from(pemContents, "base64");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(unsigned)
  );

  const jwt = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

export interface ChatbotRentData {
  state: string | null;
  city: string | null;
  area: string | null;
  property_type: string | null;
  annual_rent: number | null;
  agency_fee: number | null;
  caution_deposit: number | null;
  service_charge: number | null;
  finder_fee: number | null;
  power_hours: number | null;
  power_band: string | null;
  power_metering: string | null;
  confidence: string;
}

export async function writeToSheet(data: ChatbotRentData): Promise<void> {
  const token = await getAccessToken();

  const row = [
    new Date().toISOString(),
    data.state ?? "",
    data.city ?? "",
    data.area ?? "",
    data.property_type ?? "",
    data.annual_rent ?? "",
    data.agency_fee ?? "",
    data.caution_deposit ?? "",
    data.service_charge ?? "",
    data.finder_fee ?? "",
    data.confidence,
    "chatbot",
    data.power_hours ?? "",
    data.power_band ?? "",
    data.power_metering ?? "",
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${err}`);
  }
}
