"""Roda dentro do Blender ao abrir: liga o complemento MCP for Blender e sobe o servidor local (localhost:9876).

Telemetria e coleta de dados ficam desligadas; este script não liga nada disso.
"""
import bpy

bpy.ops.preferences.addon_enable(module="blender_mcp")
bpy.context.scene.blendermcp_port = 9876
bpy.ops.blendermcp.start_server()
print("MCP: servidor iniciado em localhost:9876")
