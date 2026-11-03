'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * The one WebGL moment on the site: a wireframe market sphere — graphite facets, a single lime
 * ring on the equator and lime points for the exchanges — turning slowly and leaning a little
 * toward the pointer. No textures, no post-processing: it has to stay cheap.
 */
function Sphere() {
    const group = useRef<THREE.Group>(null);
    const pointer = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const onMove = (event: PointerEvent) => {
            pointer.current.x = event.clientX / window.innerWidth - 0.5;
            pointer.current.y = event.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
    }, []);

    // Fibonacci points on the surface, one for each exchange the terminal reaches.
    const dots = useMemo(() => {
        const count = 150;
        const positions = new Float32Array(count * 3);
        const radius = 1.74;
        for (let i = 0; i < count; i += 1) {
            const y = 1 - (i / (count - 1)) * 2;
            const ring = Math.sqrt(1 - y * y);
            const theta = i * Math.PI * (3 - Math.sqrt(5));
            positions[i * 3] = Math.cos(theta) * ring * radius;
            positions[i * 3 + 1] = y * radius;
            positions[i * 3 + 2] = Math.sin(theta) * ring * radius;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geometry;
    }, []);

    useFrame((_, delta) => {
        const g = group.current;
        if (!g) return;
        g.rotation.y += delta * 0.11;
        // Damped lean toward the pointer, never raw tracking.
        g.rotation.x += (-pointer.current.y * 0.35 - g.rotation.x) * 0.045;
        g.rotation.z += (pointer.current.x * 0.22 - g.rotation.z) * 0.045;
    });

    return (
        <group ref={group} position={[0.45, 0, 0]}>
            <mesh>
                <icosahedronGeometry args={[1.62, 3]} />
                <meshBasicMaterial wireframe color="#5d6d67" transparent opacity={0.32} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.66, 0.005, 8, 160]} />
                <meshBasicMaterial color="#C9F36A" transparent opacity={0.85} />
            </mesh>
            <points geometry={dots}>
                <pointsMaterial color="#C9F36A" size={0.028} sizeAttenuation transparent opacity={0.85} />
            </points>
        </group>
    );
}

export default function MarketSphere() {
    return (
        <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0, 4.4], fov: 45 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
            style={{ width: '100%', height: '100%' }}
        >
            <Sphere />
        </Canvas>
    );
}
