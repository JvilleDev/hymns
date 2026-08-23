export const useAnnouncementIcons = () => {
    const { getMedia, getFullUrl } = useApi()

    const staticIcons = [
        { name: 'triangle', label: 'Triángulo (Borde)', icon: 'tabler:triangle' },
        { name: 'david', label: 'Estrella de David', icon: 'mdi:star-david' },
        { name: "eagle", label: "Águila", icon: "icon-park-outline:eagle" },
        { name: 'arrow-right', label: 'Flecha Derecha', icon: 'tabler:arrow-right' },
        { name: 'arrow-left', label: 'Flecha Izquierda', icon: 'tabler:arrow-left' },
    ]

    const icons = useState('announcement-icons', () => [...staticIcons])

    const fetchMediaIcons = async () => {
        try {
            const mediaList = await getMedia()
            const dynamicIcons = mediaList
                .filter(m => m.type === 'image')
                .map(m => ({
                    name: m.name,
                    label: m.name,
                    icon: '',
                    url: getFullUrl(m.url)
                }))
            icons.value = [...staticIcons, ...dynamicIcons]
        } catch (e) {
            console.error('Error fetching media icons', e)
        }
    }

    onMounted(() => {
        fetchMediaIcons()
    })

    return {
        icons,
        fetchMediaIcons
    }
}
