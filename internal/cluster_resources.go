package internal

import (
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/gobuffalo/flect"
	"github.com/pkg/errors"
	"sigs.k8s.io/cluster-api/cmd/clusterctl/client"
	"sigs.k8s.io/cluster-api/cmd/clusterctl/client/tree"
	ctrlclient "sigs.k8s.io/controller-runtime/pkg/client"
)

type ClusterResourceNode struct {
	Name        string                 `json:"name"`
	DisplayName string                 `json:"displayName"`
	Kind        string                 `json:"kind"`
	Group       string                 `json:"group"`
	Version     string                 `json:"version"`
	Provider    string                 `json:"provider"`
	UID         string                 `json:"uid"`
	IsVirtual   bool                   `json:"isVirtual"`
	Collapsable bool                   `json:"collapsable"`
	Children    []*ClusterResourceNode `json:"children"`
}

func ConstructClusterResourceTree(defaultClient client.Client, dcOptions client.DescribeClusterOptions) (*ClusterResourceNode, *HTTPError) {
	objTree, err := defaultClient.DescribeCluster(dcOptions)
	if err != nil {
		if strings.HasSuffix(err.Error(), "not found") {
			log.Printf("Has suffix")
			return nil, &HTTPError{Status: 404, Message: err.Error()}
		}

		return nil, NewInternalError(err)
	}
	dcOptions.Grouping = false
	objTreeUngrouped, err := defaultClient.DescribeCluster(dcOptions)
	if err != nil {
		if strings.HasSuffix(err.Error(), "not found") {
			log.Printf("Has suffix")
			return nil, &HTTPError{Status: 404, Message: err.Error()}
		}

		return nil, NewInternalError(err)
	}

	resourceTree := objectTreeToResourceTree(objTree, objTreeUngrouped, objTree.GetRoot())

	return resourceTree, nil
}

func objectTreeToResourceTree(objTree *tree.ObjectTree, objTreeUngrouped *tree.ObjectTree, object ctrlclient.Object) *ClusterResourceNode {
	if object == nil {
		return nil
	}

	group := object.GetObjectKind().GroupVersionKind().Group
	kind := object.GetObjectKind().GroupVersionKind().Kind
	version := object.GetObjectKind().GroupVersionKind().Version

	// fmt.Printf("%s %s %s %s\n", group, kind, version, object.GetObjectKind().GroupVersionKind().String())
	provider, err := getProvider(object, group)
	if err != nil {
		log.Println(err)
	}
	displayName := tree.GetMetaName(object)
	if displayName == "" {
		displayName = object.GetName()
	}
	if tree.IsGroupObject(object) {
		// TODO: use GetGroupItems to be able to expand subgroups
		items := strings.Split(tree.GetGroupItems(object), tree.GroupItemsSeparator)
		kind := flect.Pluralize(strings.TrimSuffix(object.GetObjectKind().GroupVersionKind().Kind, "Group"))
		displayName = fmt.Sprintf("%d %s...", len(items), kind)
	}
	node := &ClusterResourceNode{
		Name:        object.GetName(),
		DisplayName: displayName,
		Kind:        kind,
		Group:       group,
		Version:     version,
		Provider:    provider,
		IsVirtual:   tree.IsVirtualObject(object),
		Collapsable: tree.IsVirtualObject(object),
		Children:    []*ClusterResourceNode{},
		UID:         string(object.GetUID()),
	}

	children := objTree.GetObjectsByParent(object.GetUID())
	sort.Slice(children, func(i, j int) bool {
		return children[i].GetObjectKind().GroupVersionKind().Kind < children[j].GetObjectKind().GroupVersionKind().Kind
	})

	for _, child := range children {
		node.Children = append(node.Children, objectTreeToResourceTree(objTree, objTreeUngrouped, child))
	}

	return node
}

func getProvider(object ctrlclient.Object, group string) (string, error) {
	providerIndex := strings.IndexByte(group, '.')
	if tree.IsVirtualObject(object) {
		return "virtual", nil
	} else if providerIndex > -1 {
		return group[:providerIndex], nil
	} else {
		return "", errors.Errorf("No provider found for object %s of %s \n", object.GetName(), object.GetObjectKind().GroupVersionKind().String())
	}
}
