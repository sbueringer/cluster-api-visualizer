const axios = require('axios');

const http = axios.create({
  baseURL: 'http://localhost:3080/',
})

export async function getCluster(clusterId) {
  console.log("Getting Cluster " + clusterId);
  const response = await axios.get(`/api/cluster/`, { params: { ID: clusterId }} );
  return response.data;
}
