import os
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests

# Load variables from a local .env file if python-dotenv is installed.
# This is optional: the app works fine without it (mock mode), and
# GEMINI_API_KEY can always be set as a real environment variable instead.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-learning-app")

app = FastAPI(title="Interactive AI Learning App Backend")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExplainRequest(BaseModel):
    topic: str
    module: str
    context: Optional[Dict[str, Any]] = None
    apiKey: Optional[str] = None

# Contextual high-quality educational responses for offline/mock mode
MOCK_DATABASE = {
    "biology": {
        "nucleus": r"""### The Nucleus: The Cell's Control Center

The **nucleus** is the membrane-bound organelle found in eukaryotic cells that contains the vast majority of the cell's genetic material. It functions as the command center, coordinating key cellular activities such as growth, metabolism, protein synthesis, and cell division.

#### Key Features & Structure:
*   **Nuclear Envelope:** A double membrane that encloses the nucleus, separating it from the cytoplasm. It contains **nuclear pores** that regulate the passage of macromolecules (like RNA and proteins).
*   **Nucleolus:** A dense region inside the nucleus responsible for producing ribosomes.
*   **Chromatin:** The complex of DNA and packaging proteins (histones) that condenses into chromosomes during cell division.

> [!TIP]
> Think of the nucleus as the Cell's Library: the DNA is the master reference books that never leave the room, while RNA molecules are photocopies of specific chapters sent to the factory floor (ribosomes) to build proteins!""",
        
        "mitochondria": r"""### Mitochondria: The Powerhouse of the Cell

**Mitochondria** are double-membrane-bound organelles responsible for generating adenosine triphosphate (ATP), the primary energy currency used by cells to perform chemical work.

#### Key Features & Structure:
*   **Outer Membrane:** Smooth and permeable to small molecules.
*   **Inner Membrane:** Highly folded into structures called **cristae** to maximize surface area. This fold hosts the Electron Transport Chain (ETC) proteins.
*   **Matrix:** The fluid interior space containing enzymes for the Krebs Cycle, as well as the mitochondrion's own DNA and ribosomes (supporting the **Endosymbiotic Theory**).

> [!NOTE]
> Mitochondria are unique because they contain their own circular DNA, inherited maternally in humans, suggesting they evolved from ancient free-living oxygen-breathing bacteria engulfed by early eukaryotic cells!""",
        
        "ribosomes": r"""### Ribosomes: The Protein Factories

**Ribosomes** are small, dense structures made of ribosomal RNA (rRNA) and proteins. Unlike many organelles, they are *not* enclosed by a lipid membrane. Their function is to translate genetic code (mRNA) into polypeptide chains (proteins).

#### Key Features & Location:
*   **Free Ribosomes:** Suspended in the cytosol; they synthesize proteins that function *inside* the cytoplasm.
*   **Bound Ribosomes:** Attached to the Rough Endoplasmic Reticulum (RER); they synthesize proteins destined for membranes, packaging, or export outside the cell.
*   **Subunits:** Consists of a **large subunit** and a **small subunit** that clamp around mRNA like a zipper.

> [!IMPORTANT]
> Ribosomes translate genetic code at an astonishing speed, bonding amino acids together at a rate of about 20 per second!""",

        "endoplasmic_reticulum": r"""### Endoplasmic Reticulum: The Cellular Highway

The **Endoplasmic Reticulum (ER)** is a vast network of folded membranes and membranous tubules continuous with the nuclear envelope. It acts as the cell's manufacturing and transport hub.

#### Types of ER:
1.  **Rough ER (RER):** Studded with ribosomes. It folds, modifies, and packages newly synthesized proteins into transport vesicles.
2.  **Smooth ER (SER):** Lacks ribosomes. It is responsible for lipid synthesis (phospholipids and steroids), carbohydrate metabolism, calcium storage (in muscles), and detoxification of drugs/toxins.

> [!WARNING]
> Accumulation of unfolded or misfolded proteins in the ER causes "ER Stress," triggering the Unfolded Protein Response (UPR), which can lead to programmed cell death (apoptosis) if not resolved.""",

        "golgi_apparatus": r"""### Golgi Apparatus: The Shipping & Receiving Center

The **Golgi apparatus** (or Golgi body) consists of a series of flattened, membrane-bound sacs called **cisternae**. It behaves like a cellular post office—sorting, modifying, and shipping proteins and lipids.

#### How it Works:
*   **Cis Face:** The receiving dock. Transport vesicles from the Endoplasmic Reticulum fuse here, emptying their cargo.
*   **Modification:** Enzymes inside the Golgi add carbohydrate chains (glycosylation) or phosphate groups to target molecules for specific destinations.
*   **Trans Face:** The shipping dock. Sorted cargo is loaded into secretory or lysosomal vesicles and dispatched to the cell membrane or other parts of the cell.

> [!TIP]
> The Golgi apparatus is highly developed in cells that specialize in secretion, such as salivary gland cells or antibody-secreting immune cells!""",

        "cell_membrane": r"""### Cell Membrane: The Selective Gatekeeper

The **cell membrane** (plasma membrane) is a semi-permeable phospholipid bilayer that surrounds the cell, protecting its internal environment from the extracellular space.

#### Key Structures:
*   **Phospholipid Bilayer:** Hydrophilic (water-loving) heads face outward, while hydrophobic (water-fearing) tails face inward, forming a barrier to water-soluble substances.
*   **Membrane Proteins:** Transport proteins (channels and pumps), receptor proteins (for cell signaling), and glycoproteins (cell-to-cell recognition).
*   **Cholesterol:** Molecules wedged between phospholipids to maintain membrane fluidity across different temperatures.

> [!NOTE]
> The modern model of the cell membrane is called the **Fluid Mosaic Model**, because the lipids and proteins drift laterally like boats floating on a crowded lake."""
    },
    "physics": {
        "sun": r"""### The Central Star: Gravitational Anchor

In an orbital system, the central star (or Sun) provides the overwhelming gravitational force that keeps planets in orbit. According to Newton's law of universal gravitation, every particle attracts every other particle with a force directly proportional to the product of their masses and inversely proportional to the square of the distance between their centers.

#### Key Concepts:
*   **Gravitational Pull:** $F = G \\frac{M \\cdot m}{r^2}$. Because the star's mass ($M$) is massive compared to the planet's mass ($m$), it remains virtually stationary while the planet orbits around it.
*   **Spacetime Curvature:** In General Relativity, the star's immense mass warps the fabric of spacetime, and the planet is simply following the straightest possible path (a geodesic) through this curved space.

> [!IMPORTANT]
> The Sun contains **99.86%** of all the mass in our solar system, which is why its gravitational dominion extends billions of miles away!""",
        
        "planet": r"""### Planetary Orbit Dynamics

A planet remains in orbit because its forward motion (tangential velocity) is perfectly balanced by the inward pull of gravity from the star. If there were no gravity, the planet would fly off in a straight line. If the planet stopped moving forward, it would fall directly into the star.

#### Orbital Characteristics:
*   **Velocity Vector:** Always tangent to the orbital path.
*   **Acceleration Vector:** Always points directly toward the center of mass of the star (centripetal acceleration).
*   **Kepler's First Law:** All planets move in elliptical orbits with the sun at one focus.

> [!TIP]
> An orbit is essentially a perpetual fall! The planet is falling toward the star, but it is moving forward so fast that it keeps missing the star!""",

        "orbit_analysis": r"""### Orbital Stability Analysis

Your orbit is determined by three variables: **Orbital Radius ($r$)**, **Star Mass ($M$)**, and **Tangential Velocity ($v$)**.

#### Orbital States:
1.  **Stable Circular Orbit ($v = v_c = \\sqrt{GM/r}$):** The perfect balance. The distance to the star remains constant, creating a circular trajectory.
2.  **Stable Elliptical Orbit ($v_c < v < v_e$):** The planet recedes and approaches the star periodically. Speed increases as it gets closer (periapsis) and decreases as it moves further away (apoapsis), obeying Kepler's Second Law.
3.  **Gravitational Collapse ($v < v_c$):** The planet's forward velocity is too slow to resist gravity. It spirals inward and collides with the star.
4.  **Hyperbolic Escape ($v \\ge v_e = \\sqrt{2GM/r}$):** The planet reaches or exceeds **escape velocity**. The gravitational pull of the star is not strong enough to hold it, and it escapes into deep space along a hyperbolic trajectory.

> [!WARNING]
> Small changes in initial velocity can drastically convert a circular orbit into an extreme ellipse or cause gravitational collapse! Try adjusting velocity slowly in the simulation!"""
    },
    "chemistry": {
        "water": r"""### Water ($H_2O$): The Universal Solvent

**Water** is a simple molecule consisting of one oxygen atom covalently bonded to two hydrogen atoms. Despite its simplicity, it is the most critical compound for life on Earth.

#### Structure & Bonding:
*   **Chemical Formula:** $H_2O$
*   **Molecular Geometry:** Bent shape (bond angle of approximately $104.5^\\circ$) due to the two lone pairs of electrons on the oxygen atom squeezing the two hydrogen bonds together.
*   **Polarity:** Oxygen is highly electronegative, pulling shared electrons closer to itself. This creates a partial negative charge ($\delta^-$) near oxygen and a partial positive charge ($\delta^+$) near hydrogens.

> [!TIP]
> Because of its polarity, water molecules form **hydrogen bonds** with each other. This gives water its high boiling point, high surface tension, and makes ice less dense than liquid water!""",
        
        "carbon_dioxide": r"""### Carbon Dioxide ($CO_2$): The Carbon Cycle Engine

**Carbon Dioxide** is an inorganic compound composed of a carbon atom double-bonded to two oxygen atoms. It is a vital greenhouse gas that plays a central role in photosynthesis and cellular respiration.

#### Structure & Bonding:
*   **Chemical Formula:** $CO_2$
*   **Molecular Geometry:** Linear shape (bond angle of exactly $180^\\circ$).
*   **Polarity:** Although individual $C=O$ double bonds are polar, they point in opposite directions, canceling out. Therefore, the molecule as a whole is **non-polar**.

> [!WARNING]
> While $CO_2$ is essential for keeping Earth warm enough for life, industrial emissions have rapidly increased its concentration, trapping excess heat in the atmosphere and causing global warming.""",

        "methane": r"""### Methane ($CH_4$): Simple Hydrocarbon

**Methane** is a chemical compound consisting of one carbon atom bonded to four hydrogen atoms. It is the simplest alkane and the primary constituent of natural gas.

#### Structure & Bonding:
*   **Chemical Formula:** $CH_4$
*   **Molecular Geometry:** Tetrahedral (bond angle of exactly $109.5^\\circ$). The four $C-H$ bonds push away from each other equally in 3D space to minimize electron repulsion (VSEPR theory).
*   **Properties:** Highly flammable, odorless, and a potent greenhouse gas (about 28 times more effective at trapping heat than $CO_2$ over a 100-year timescale).

> [!NOTE]
> Methane is produced naturally through anaerobic digestion (e.g. in wetlands, rice paddies, and the digestive tracts of ruminants like cows).""",

        "ammonia": r"""### Ammonia ($NH_3$): Alkaline Nitrogen Compound

**Ammonia** is a compound of nitrogen and hydrogen. It is a colorless gas with a highly pungent odor, widely used in agriculture as fertilizer and in industrial synthesis.

#### Structure & Bonding:
*   **Chemical Formula:** $NH_3$
*   **Molecular Geometry:** Trigonal Pyramidal (bond angle of approximately $107^\circ$). The single lone pair on the nitrogen atom pushes the three nitrogen-hydrogen bonds downward.
*   **Properties:** Weak base, highly soluble in water, and critical for producing nitrogen-based chemicals via the Haber-Bosch process.

> [!IMPORTANT]
> The Haber-Bosch process for synthesizing ammonia is estimated to sustain nearly half of the global human population today by enabling mass fertilizer production!""",

        "oxygen_gas": r"""### Oxygen Gas ($O_2$): Respiration Fuel

**Oxygen gas** (molecular oxygen) consists of two oxygen atoms joined by a strong double covalent bond. It makes up approximately 21% of Earth's atmosphere.

#### Structure & Bonding:
*   **Chemical Formula:** $O_2$
*   **Molecular Geometry:** Linear.
*   **Bonding:** Double bond sharing 4 electrons ($O=O$).
*   **Importance:** Acts as the terminal electron acceptor in the Electron Transport Chain during cellular respiration, allowing aerobic organisms to efficiently extract energy from food.

> [!NOTE]
> Major atmospheric oxygen was first produced around 2.4 billion years ago during the **Great Oxidation Event**, driven by ancient photosynthesizing cyanobacteria!"""
    }
}

def call_gemini_api(api_key: str, prompt: str) -> str:
    """Helper to send a prompt to Gemini API via direct HTTP request."""
    # We will use the direct HTTP REST endpoint for gemini-1.5-flash
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 800
        }
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        # Extract text content from Gemini JSON structure
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
        
        logger.error(f"Invalid API response structure: {data}")
        raise HTTPException(status_code=500, detail="Unable to extract response content from Gemini API.")
    except Exception as e:
        logger.error(f"Error calling Gemini API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gemini API request failed: {str(e)}")

@app.post("/api/explain")
def explain_topic(req: ExplainRequest):
    topic_key = req.topic.lower().replace(" ", "_")
    logger.info(f"Received request for topic: {req.topic} (module: {req.module})")
    
    # Identify key to retrieve from mock db
    module_db = MOCK_DATABASE.get(req.module.lower(), {})
    mock_explanation = module_db.get(topic_key)
    
    # If not found exactly, do a partial match or default
    if not mock_explanation:
        for k, val in module_db.items():
            if k in topic_key or topic_key in k:
                mock_explanation = val
                break
    
    if not mock_explanation:
        mock_explanation = f"### {req.topic.title()}\n\nDetailed educational information about this topic is currently being researched. In sandbox mode, please configure your API key to request deep AI analysis."
    
    # Determine API key to use
    api_key = req.apiKey or os.environ.get("GEMINI_API_KEY")
    
    if not api_key:
        # Return mock data
        return {
            "success": True,
            "explanation": mock_explanation,
            "source": "mock"
        }
    
    # Generate real AI explanation using Gemini API
    # Tailor prompt depending on module context
    context_str = f" Contextual values: {req.context}" if req.context else ""
    
    prompt = (
        f"You are a premium, expert AI educational assistant. Provide an engaging, highly detailed explanation of "
        f"'{req.topic}' for a student studying {req.module.capitalize()}."
        f"{context_str}\n\n"
        f"Format your output in clean Markdown with headers, bullet points, and at least one Github-style warning, tip, note, or important box: "
        f"\n- > [!NOTE]\n- > [!TIP]\n- > [!IMPORTANT]\n- > [!WARNING]\n\n"
        f"Focus on clarity, real-world analogies, and the scientific concepts. Make it feel premium, engaging, and readable."
    )
    
    try:
        explanation = call_gemini_api(api_key, prompt)
        return {
            "success": True,
            "explanation": explanation,
            "source": "gemini"
        }
    except Exception as e:
        # Fallback to mock on error to maintain high availability
        logger.warning(f"Gemini API invocation failed, falling back to mock: {str(e)}")
        return {
            "success": True,
            "explanation": f"> [!WARNING]\n> Gemini API call failed, falling back to offline content.\n\n" + mock_explanation,
            "source": "mock_fallback"
        }

# Mount static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
    os.makedirs(os.path.join(static_dir, "css"))
    os.makedirs(os.path.join(static_dir, "js"))
    os.makedirs(os.path.join(static_dir, "js", "modules"))

# We mount static files at root
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    reload_enabled = os.environ.get("RELOAD", "true").lower() == "true"
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=reload_enabled)
