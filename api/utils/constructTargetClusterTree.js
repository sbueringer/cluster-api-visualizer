const k8s = require('@kubernetes/client-node');
const { default: cluster } = require('cluster');
const { assert } = require('console');

const HttpStatus = require('http-status-codes')

function findRef(spec, refKind) {
  let result = null;
  if (spec == undefined || spec.constructor.name != 'Object')
    return null;
  for (const [k, v] of Object.entries(spec)) {
    if (k == refKind)
      return v
    let recurse = findRef(v, refKind)
    if (recurse != null)
      result = recurse;
  }

  return result;
}

function resolveAllCategories(allCrds, clusterUid) {

  //   // 3. If the category depends on context, i.e. Machine, then resolve it now
  // crd.category = resolveCategory(crd, clusterUid)

  // // Lastly, take all the parents that point to the root and bind them to their respective category node
  // if (owner == clusterUid)
  //   owner = crd.category;
  const idMapping = allCrds.reduce((acc, e, i) => {
    acc[e.key] = i;
    return acc;
  }, {});

  const refs = ['configRef', 'infrastructureRef', 'controlPlaneRef']
  allCrds.forEach((crd, i, arr) => {
    console.log('Resource', crd.key)
    if (crd.labels !== undefined && 'cluster.x-k8s.io/control-plane' in crd.labels)
      arr[i].refCategory = 'controlPlane';
    else if (crd.kind == 'Cluster')
      arr[i].refCategory = null; // Root node has a null category, which is different from undefined

    refs.forEach(r => {
      let objectRef = findRef(crd, r)
      if (objectRef != null) {
        let key = objectRef.kind + '/' + objectRef.name;
        let refIndex = idMapping[key];
        console.log('Found ref', r, 'at', refIndex, 'for object', arr[refIndex].key);
        arr[refIndex].refPointer = i; // TODO: resolve multiple refs on the same resource
        arr[refIndex].refKind = r;

      }
    })
  })

  let changed;
  do {
    changed = false;
    allCrds.forEach((crd, i, arr) => {
      if (crd.refCategory === undefined) {
        if (crd.refPointer != null) {
          let referring = arr[crd.refPointer];
          console.log('Ref for', crd.key, 'is', referring.key, 'with', referring.refCategory);
          if (referring.refCategory == 'controlPlane' || crd.refKind == 'controlPlaneRef') {
            arr[i].refCategory = 'controlPlane';
            changed = true;
          } else if (referring.kind == 'Cluster' && crd.refKind == 'infrastructureRef') {
            arr[i].refCategory = 'clusterInfra';
            changed = true;
          }
        } else if (crd.kind == 'ClusterResourceSet' || crd.kind == 'ClusterResourceSetBinding') {
          arr[i].refCategory = 'clusterInfra';
          changed = true;
        }
      }
    })
  } while (changed);

  allCrds.forEach((crd, i, arr) => {
    if (crd.refCategory === undefined) {
      arr[i].refCategory = 'workers';
    }
  })

  allCrds.forEach((crd, i, arr) => {
    // Lastly, take all the parents that point to the root and bind them to their respective category node
    if (crd.parent == clusterUid)
      arr[i].parent = crd.refCategory;
  })

  return allCrds;
}

const multipleOwners = {
  // Format = Kind: { ExpectedOwner, RedundantOwners }
  'AzureMachine': { expectedOwner: 'Machine', redundantOwners: ['KubeadmControlPlane'] },
  'DockerMachine': { expectedOwner: 'Machine', redundantOwners: ['KubeadmControlPlane'] },
  'KubeadmConfig': { expectedOwner: 'Machine', redundantOwners: ['KubeadmControlPlane'] },
  'ClusterResourceSetBinding': { expectedOwner: 'ClusterResourceSet', redundantOwners: ['Cluster'] },
}

function resolveOwners(crd) {
  let owners = crd.ownerRefs;

  if (owners.length > 1) { // If multiple owners 

    // If kind in lookup table
    if (crd.kind in multipleOwners) {
      let expectedOwner = multipleOwners[crd.kind].expectedOwner;
      let allOwners = new Set(multipleOwners[crd.kind].redundantOwners);
      allOwners.add(expectedOwner);

      // If owners match owners in lookup table for kind
      if (owners.length == allOwners.size) {
        let match = true;
        owners.forEach((o, i) => {
          match = match && allOwners.has(o.kind);
        });

        if (match)
          return owners.filter(o => o.kind == expectedOwner)[0].uid; // Return ID of expected owner type in owner refs if matched
      }
      console.log('Cannot resolve multiple owners for', crd.kind);
      console.log(owners);
      throw 'Failed to resolve multiple owners!';
    }

  } else { // If only one owner, easy case
    return owners[0].uid;
  }
}

async function getCRDInstances(group, plural, clusterName, clusterUid) {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const k8sCrd = kc.makeApiClient(k8s.CustomObjectsApi);

  try {
    const res = await k8sCrd.listClusterCustomObject(group, 'v1beta1', plural);
    let crds = [];
    res.body.items.forEach((e, i) => {
      // 1. Init easy fields
      let crd = {
        id: e.metadata.uid,
        name: e.metadata.name,
        kind: e.kind,
        key: e.kind + '/' + e.metadata.name,
        group: group,
        plural: plural,
        provider: group.substr(0, group.indexOf('.')),
        ownerRefs: e.metadata.ownerReferences,
        labels: e.metadata.labels,
        spec: e.spec,
        refPointer: null,
        refKind: null
      }

      // 2. If there are resources left without owners, bind them to the root
      let owner;
      if (crd.kind == 'Cluster') { // Root node has no owner
        owner = null;
      } if (e.metadata.ownerReferences === undefined) { // If no owners and not the root, i.e. bucket/category nodes
        owner = clusterUid;
      } else {
        owner = resolveOwners(crd);
      }

      crd.parent = owner;
      crds.push(crd)
    })

    return crds;
  } catch (error) {
    if (error.statusCode == HttpStatus.NOT_FOUND)
      return [];
    console.log(error);
    throw 'Error fetching for ' + plural + ' in ' + clusterName
  }
}

async function fetchCRDTypes() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const k8sApi = kc.makeApiClient(k8s.ApiextensionsV1Api);
  let response = await k8sApi.listCustomResourceDefinition();

  let resources = {}
  response.body.items.forEach(item => {
    resources[item.spec.names.plural] = item.spec.group
  })

  return resources;
}

module.exports = async function constructTargetClusterTree(clusterName) {
  // Hack since getClusterCustomObject is getting a 404
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const k8sCrd = kc.makeApiClient(k8s.CustomObjectsApi);

  const response = await k8sCrd.listClusterCustomObject('cluster.x-k8s.io', 'v1beta1', 'clusters');
  let clusters = response.body.items.filter(e => e.metadata.name == clusterName);
  assert(clusters.length == 1);
  let clusterUid = clusters[0].metadata.uid;
  let clusterLabels = clusters[0].metadata.labels;
  // End hack

  const resources = await fetchCRDTypes();
  let allCrds = [];

  for (const [plural, group] of Object.entries(resources)) {
    const instances = await getCRDInstances(group, plural, clusterName, clusterUid);
    allCrds = allCrds.concat(instances);
  }

  const whitelistKinds = ['ClusterResourceSet', 'ClusterResourceSetBinding'];

  let crds = allCrds.filter(crd => (
    (crd.labels !== undefined && crd.labels['cluster.x-k8s.io/cluster-name'] == clusterName) ||
    (crd.ownerRefs !== undefined && crd.ownerRefs.find(o => o.uid == clusterUid)) ||
    crd.name.indexOf(clusterName) == 0 ||
    whitelistKinds.includes(crd.kind)
  ));

  // TODO: Filter types with cluster-name label instead
  // let crds = allCrds.filter(crd => (crd.labels['cluster.x-k8s.io/cluster-name'] == clusterName || whitelistKinds.includes(crd.kind)));

  let binding = allCrds.find(crd => (
    crd.kind == 'ClusterResourceSetBinding' &&
    crd.ownerRefs.find(e => e.kind == 'Cluster').name == clusterName
  ));

  if (binding) {
    let resourceSetNames = new Set();
    binding.spec.bindings.forEach(e => {
      resourceSetNames.add(e.clusterResourceSetName);
    });
    crds = crds.filter(crd => (
      !whitelistKinds.includes(crd.kind) || // Keep non binding or resource set
      (crd.kind == 'ClusterResourceSet' && resourceSetNames.has(crd.name)) ||
      (crd.kind == 'ClusterResourceSetBinding' && crd.name == binding.name)
    ));
  } else {
    crds = crds.filter(crd => (!whitelistKinds.includes(crd.kind)));
  }

  let resolved = resolveAllCategories(crds, clusterUid);
  console.log('Categories Are');
  resolved.forEach(e => {
    console.log(e.kind + '/' + e.name);
    console.log(e.category);
    console.log(e.refCategory);
    console.log();
  })


  // Add dummy nodes with CRDs
  let dummyNodes = [
    {
      name: '',
      kind: 'ClusterInfrastructure',
      id: 'clusterInfra',
      provider: '',
      collapsable: true,
      parent: clusterUid,
    },
    {
      name: '',
      kind: 'ControlPlane',
      id: 'controlPlane',
      provider: '',
      collapsable: true,
      parent: clusterUid,
    },
    {
      name: '',
      kind: 'Workers',
      id: 'workers',
      provider: '',
      collapsable: true,
      parent: clusterUid,
    },
  ];

  crds = crds.concat(dummyNodes);

  // Create mapping to prepare to construct tree
  const idMapping = crds.reduce((acc, e, i) => {
    acc[e.id] = i;
    return acc;
  }, {});

  // console.log(idMapping);

  let root;
  // console.log(crds);
  crds.forEach(e => {
    // Handle the root element
    if (e.parent == null) {
      root = e;
      return;
    }
    // Use our mapping to locate the parent element in our data array
    let parentNode = crds[idMapping[e.parent]];

    // console.log('Parent', parentNode);
    // console.log('Child', e);
    // console.log('\n');

    // Add our current e to its parent's `children` array
    if (parentNode.children === undefined)
      parentNode.children = [];

    parentNode.children.push(e)


  });

  // console.log('Final tree:');
  // console.log(root);
  return root;

}

