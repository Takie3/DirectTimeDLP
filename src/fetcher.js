import axios from 'axios';

// Themeparks API Entity IDs for Disneyland Paris
// dae968d5-630d-4719-8b06-3d107e944401 = Disneyland Park (Paris)
// ca888437-ebb4-4d50-aed2-d227f7096968 = Walt Disney Studios Park (Paris)

const DLP_PARKS = [
    { id: 'dae968d5-630d-4719-8b06-3d107e944401', name: 'Disneyland Park' },
    { id: 'ca888437-ebb4-4d50-aed2-d227f7096968', name: 'Walt Disney Studios Park' }
];

export async function fetchDisneylandParisData(apiUrl) {
    let allAttractions = [];

    for (const park of DLP_PARKS) {
        try {
            // Fetch live data directly from the entity's live data endpoint
            const response = await axios.get(`${apiUrl}/${park.id}/live`, { timeout: 10000 });

            if (response.data && response.data.liveData) {
                // Filter only ATTRACTION types and map the data
                const attractions = response.data.liveData
                    .filter(entity => entity.entityType === 'ATTRACTION')
                    .map(attraction => {
                        let status = attraction.status; // Usually "OPERATING", "DOWN", "CLOSED", "REFURBISHMENT"
                        let waitTime = null;

                        // Check the standby queue for wait times
                        if (attraction.queue && attraction.queue.STANDBY) {
                            waitTime = attraction.queue.STANDBY.waitTime;
                        }

                        // We can return a normalized object
                        return {
                            id: attraction.id,
                            name: attraction.name,
                            parkId: park.id,
                            status: status,
                            wait_time: waitTime
                        };
                    });

                allAttractions = allAttractions.concat(attractions);
            }
        } catch (error) {
            console.error(`Error fetching data for park ${park.name}:`, error.message);
        }
    }

    return allAttractions;
}
